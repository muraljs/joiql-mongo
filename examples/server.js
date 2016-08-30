const {
  query,
  mutation,
  connect,
  model,
  models,
  objectid,
  string,
  boolean,
  array,
  object
} = require('../')
connect('mongodb://localhost:27017/joiql-mongo')

const tweet = model('tweet', {
  body: string()
    .description('Tweet body, no more than 150 characters')
    .meta((is) => ({
      create: is.required().max(150)
    })),
  published: boolean()
    .description('Visible to public or not')
    .meta((is) => ({
      create: is.default(false)
    })),
  userId: objectid()
    .description('User ID'),
  comments: array()
    .description('Comments on the tweet')
    .items(object({
      body: string()
        .meta((on) => on('create').required()),
      userId: objectid()
        .meta((on) => on('create').required())
    }).meta({ name: 'Comment' }))
})

tweet.on('create', (ctx, next) => {
  console.log('1')
  next().then(() => console.log('4'))
})

tweet.on('create', (ctx, next) => {
  console.log('2')
  next().then(() => console.log('3'))
})

const user = model('user', {
  name: string()
    .description('User name')
    .meta((is) => ({
      create: is.required()
    })),
  email: string().email()
    .description('User email address')
    .meta((is) => ({
      create: is.required()
    }))
})

const tags = query('tags', array().items(string()), (ctx, next) => {
  ctx.res.tags = ['hello', 'world']
  next()
})

const emailBlast = mutation('emailBlast', string().meta({ args: {
  emails: array().items(string().email()).required()
} }), (ctx, next) => {
  console.log(
    'blast out emails to',
    ctx.req.mutation.emailBlast.args.emails.join(', ')
  )
  next()
})

const graphqlHTTP = require('express-graphql')
const app = require('express')()

app.use('/graphql', graphqlHTTP({
  schema: models(emailBlast, tweet, user, tags).schema,
  graphiql: true
}))
app.listen(3000, () => console.log('listening on 3000'))
