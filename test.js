/* eslint-env mocha */
const { connect, model, models, string } = require('./')
const { graphql } = require('graphql')
const sinon = require('sinon')

const db = connect('mongodb://localhost:27017/joiql-mongo')
const user = model('user', {
  name: string().meta((is) => ({
    create: is.required()
  }))
})

describe('JoiQL Mongo', () => {
  beforeEach(() =>
    db.users.remove())

  it('converts a schema to a create operation', () =>
    graphql(models(user).schema, `
      mutation {
        createUser(name: "Craig") { name }
      }
    `).then(() => db.users.findOne())
      .then((doc) => doc.name.should.equal('Craig')))

  it('converts a schema to a read operation', () =>
    db.users.save({ name: 'Craig' }).then(() =>
      graphql(models(user).schema, `
        {
          user { name }
        }
      `).then((res) => res.data.user.name.should.equal('Craig'))))

  it('converts a schema to a update operation', () =>
    db.users.save({ name: 'Craig' }).then((doc) =>
      graphql(models(user).schema, `
        mutation {
          updateUser(_id: "${doc._id}" name: "Paul") { name }
        }
      `)
      .then((res) => {
        res.data.updateUser.name.should.equal('Paul')
        return db.users.findOne({ _id: doc._id })
      })
      .then((doc) => doc.name.should.equal('Paul'))))

  it('converts a schema to a delete operation', () =>
    db.users.save({ name: 'Craig' }).then((doc) =>
      graphql(models(user).schema, `
        mutation {
          deleteUser(_id: "${doc._id}") { name }
        }
      `).then(() => db.users.find())
        .then((docs) => docs.length.should.equal(0))))

  it('converts a schema to a list operation', () =>
    db.users.save({ name: 'Craig' }).then(() =>
      graphql(models(user).schema, `
        {
          users { name }
        }
      `).then((res) => res.data.users[0].name.should.equal('Craig'))))

  it('can run middleware', () => {
    const spy = sinon.spy()
    user.on('create', spy)
    graphql(models(user).schema, `
      mutation {
        createUser(name: "Craig") { name }
      }
    `).then(() => spy.called.should.be.ok())
  })
})
