const Joi = require('joi')
const mongo = require('promised-mongo')
const pluralize = require('pluralize')
const joiql = require('joiql')
const compose = require('koa-compose')
const graphqlHTTP = require('koa-graphql')
const convert = require('koa-convert')
const {
  isFunction,
  find,
  assign,
  mapValues,
  capitalize,
  merge,
  pick,
  values
} = require('lodash')

let db

// Custom ObjectID Joi schema
const objectid = Joi.extend({
  base: Joi.string(),
  name: 'string',
  pre: (val, state, options) => {
    if (options.convert) return mongo.ObjectId(val)
    else return val
  }
}).string

// Generate the _id type by default for CRUDL Joi schemas
const _id = () =>
  objectid()
    .description('Unique ID')
    .meta((is) => ({
      'create': is.forbidden(),
      'update delete': is.required()
    }))

// Adds conditional validation to an object of Joi types using the meta field
const addCRUDValidation = (attrs, method) =>
  mapValues(assign({}, attrs), (child) => {
    const extraValiation = find(child._meta, isFunction)
    if (!extraValiation) return child
    const dsl = extraValiation(child)
    const attr = find(dsl, (val, key) => key.match(method))
    return attr || child
  })

// Connect to Mongo database
exports.connect = (uri, collections) => {
  db = module.exports.db = mongo(uri, collections)
  return db
}

// Generate a model instance
exports.model = (singular, _attrs) => {
  const query = {}
  const mutation = {}
  const middleware = []
  const plural = pluralize(singular)
  const col = () => db[plural]
  const attrs = assign({}, _attrs, { _id: _id() })
  // Create schema
  const createMethod = `create${capitalize(singular)}`
  mutation[createMethod] = Joi
    .object(attrs)
    .meta({ args: addCRUDValidation(attrs, 'create') })
  middleware.push((ctx, next) => {
    const req = ctx.req.mutation && ctx.req.mutation[createMethod]
    if (!req) return next()
    return col()
      .insert(req.args)
      .then(() => { ctx.res[createMethod] = req.args })
      .then(next)
  })
  // Read schema
  query[singular] = Joi
    .object(attrs)
    .meta({ args: addCRUDValidation(attrs, 'read') })
  middleware.push((ctx, next) => {
    const req = ctx.req.query && ctx.req.query[singular]
    if (!req) return next()
    return col()
      .findOne(req.args)
      .then((doc) => { ctx.res[singular] = doc })
      .then(next)
  })
  // Update schema
  const updateMethod = `update${capitalize(singular)}`
  mutation[updateMethod] = Joi
    .object(attrs)
    .meta({ args: addCRUDValidation(attrs, 'update') })
  middleware.push((ctx, next) => {
    const req = ctx.req.mutation && ctx.req.mutation[updateMethod]
    if (!req) return next()
    return col()
      .save(req.args)
      .then((doc) => { ctx.res[updateMethod] = doc })
      .then(next)
  })
  // Delete schema
  const deleteMethod = `delete${capitalize(singular)}`
  mutation[deleteMethod] = Joi
    .object(attrs)
    .meta({ args: addCRUDValidation(attrs, 'delete') })
  middleware.push((ctx, next) => {
    const req = ctx.req.mutation && ctx.req.mutation[deleteMethod]
    if (!req) return next()
    return col()
      .remove(req.args)
      .then((doc) => { ctx.res[deleteMethod] = null })
      .then(next)
  })
  // List schema
  query[plural] = Joi
    .array()
    .items(Joi.object(attrs))
    .meta({ args: addCRUDValidation(attrs, 'list') })
  middleware.push((ctx, next) => {
    const req = ctx.req.query && ctx.req.query[plural]
    if (!req) return next()
    return col()
      .find(req.args)
      .then((docs) => { ctx.res[plural] = docs })
      .then(next)
  })
  // Prepend middleware
  const len = middleware.length
  const on = (mthd, fn) => {
    middleware.splice(len - middleware.length, 0, ((method, ctx, next) => {
      if (
        (
          method === 'create' &&
          ctx.req.mutation && ctx.req.mutation[createMethod]
        ) ||
        (
          method === 'read' &&
          ctx.req.query && ctx.req.query[singular]
        ) ||
        (
          method === 'update' &&
          ctx.req.mutation && ctx.req.mutation[updateMethod]
        ) ||
        (
          method === 'delete' &&
          ctx.req.mutation && ctx.req.mutation[deleteMethod]
        ) ||
        (
          method === 'list' &&
          ctx.req.query && ctx.req.query[plural]
        )
      ) return fn(ctx, next)
      else return next()
    }).bind(null, mthd))
  }
  // Allow convenience methods on the model for validated CRUDL outside of
  // GraphQL queries
  const generateConvenienceMethod = (method) =>
    (args) => {
      const methodName = {
        create: createMethod,
        read: singular,
        update: updateMethod,
        delete: deleteMethod,
        list: plural
      }[method]
      const schema = Joi.object(addCRUDValidation(attrs, method))
      const { error, value } = Joi.validate(args, schema)
      if (error) return Promise.reject(error)
      const req = method.match(/read|list/)
        ? { query: { [methodName]: { args: value } } }
        : { mutation: { [methodName]: { args: value } } }
      const ctx = { req, res: { [methodName]: {} }, state: {} }
      return compose(middleware)(ctx).then(() => ctx.res[methodName])
    }
  const create = generateConvenienceMethod('create')
  const find = generateConvenienceMethod('read')
  const update = generateConvenienceMethod('update')
  const destroy = generateConvenienceMethod('delete')
  const where = generateConvenienceMethod('list')
  // Return API
  return {
    query,
    mutation,
    middleware,
    on,
    col,
    create,
    find,
    update,
    destroy,
    where
  }
}

// Convenience function for creating a one-off GraphQL query or mutation with a
// model interface
exports.query = (name, schema, ...mddlware) => {
  const middleware = mddlware.map((fn) => (ctx, next) => {
    if (ctx.req.query && ctx.req.query[name]) return fn(ctx, next)
    else return next()
  })
  return { query: { [name]: schema }, middleware }
}
exports.mutation = (name, schema, ...mddlware) => {
  const middleware = mddlware.map((fn) => (ctx, next) => {
    if (ctx.req.mutation && ctx.req.mutation[name]) return fn(ctx, next)
    else return next()
  })
  return { mutation: { [name]: schema }, middleware }
}

// Combine models into a JoiQL schema
exports.models = (...models) => {
  const api = joiql(pick(merge({}, ...models), 'query', 'mutation'))
  models.forEach((model) => model.middleware.forEach(api.use))
  return api
}

// Combine a hash of models into Koa middleware
exports.graphqlize = (models) => {
  const api = exports.models(...values(models))
  return convert(graphqlHTTP({ schema: api.schema, graphiql: true }))
}

// Export Joi types
exports.objectid = objectid
exports.string = Joi.string
exports.object = Joi.object
exports.number = Joi.number
exports.array = Joi.array
exports.date = Joi.date
exports.boolean = Joi.boolean
