const {
  connect,
  model,
  string
} = require('../')
connect('mongodb://localhost:27017/joiql-mongo')

const tweet = model('tweet', {
  body: string()
    .description('Tweet body, no more than 150 characters')
    .meta((is) => ({
      create: is.required().max(150)
    }))
})

tweet.on('create', (ctx, next) => {
  console.log('on create')
  return next().then(() => console.log('after create'))
})

tweet.create({ body: 'Hello' }).then((res) => {
  console.log('final', res)
})
