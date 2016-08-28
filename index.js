const Joi = require('joi')
const mongo = require('promised-mongo')
const pluralize = require('pluralize')
const joiql = require('joiql')
const {
  isFunction,
  find,
  assign,
  mapValues,
  capitalize,
  merge,
  pick
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
      'create read list': is.forbidden(),
      'update delete': is.required()
    }))

// Adds conditional validation to an object of Joi types using the meta field
const toArgs = (attrs, method) =>
  mapValues(assign({}, attrs), (child) => {
    const extraValiation = find(child._meta, isFunction)
    if (!extraValiation) return child
    const dsl = extraValiation(child)
    const attr = find(dsl, (val, key) => key.match(method))
    return attr || child
  })

// Connect to Mongo database
exports.connect = (uri, collections) => {
  db = mongo(uri, collections)
  return db
}

// Generate a model instance
exports.model = (singular, _attrs) => {
  const query = {}
  const mutation = {}
  const middleware = []
  const plural = pluralize(singular)
  const attrs = assign({}, _attrs, { _id: _id() })
  // Create schema
  const createMethod = `create${capitalize(singular)}`
  mutation[createMethod] = Joi
    .object(attrs)
    .meta({ args: toArgs(attrs, 'create') })
  middleware.push((ctx, next) => {
    const req = ctx.req.mutation && ctx.req.mutation[createMethod]
    if (!req) return next()
    return db[plural]
      .insert(req.args)
      .then(() => { ctx.res[createMethod] = req.args })
      .then(next)
  })
  // Read schema
  query[singular] = Joi
    .object(attrs)
    .meta({ args: toArgs(attrs, 'read') })
  middleware.push((ctx, next) => {
    const req = ctx.req.query && ctx.req.query[singular]
    if (!req) return next()
    return db[plural]
      .findOne(req.args)
      .then((doc) => { ctx.res[singular] = doc })
      .then(next)
  })
  // Update schema
  const updateMethod = `update${capitalize(singular)}`
  mutation[updateMethod] = Joi
    .object(attrs)
    .meta({ args: toArgs(attrs, 'update') })
  middleware.push((ctx, next) => {
    const req = ctx.req.mutation && ctx.req.mutation[updateMethod]
    if (!req) return next()
    return db[plural]
      .update({ _id: req.args._id }, req.args)
      .then((doc) => { ctx.res[updateMethod] = doc })
      .then(next)
  })
  // Delete schema
  const deleteMethod = `delete${capitalize(singular)}`
  mutation[deleteMethod] = Joi
    .object(attrs)
    .meta({ args: toArgs(attrs, 'delete') })
  middleware.push((ctx, next) => {
    const req = ctx.req.mutation && ctx.req.mutation[deleteMethod]
    if (!req) return next()
    return db[plural]
      .remove(req.args)
      .then((doc) => { ctx.res[deleteMethod] = null })
      .then(next)
  })
  // List schema
  query[plural] = Joi
    .array()
    .items(Joi.object(attrs))
    .meta({ args: toArgs(attrs, 'list') })
  middleware.push((ctx, next) => {
    const req = ctx.req.query && ctx.req.query[plural]
    if (!req) return next()
    return db[plural]
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
  return { query, mutation, middleware, on }
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

// Export Joi types
exports.objectid = objectid
exports.string = Joi.string
exports.object = Joi.object
exports.number = Joi.number
exports.array = Joi.array
exports.date = Joi.date
exports.boolean = Joi.boolean
