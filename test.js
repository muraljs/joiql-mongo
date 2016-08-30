/* eslint-env mocha */
const { connect, model, models, string } = require('./')
const { graphql } = require('graphql')
const sinon = require('sinon')

const db = connect('mongodb://localhost:27017/joiql-mongo')

describe('JoiQL Mongo', () => {
  let user

  beforeEach(() => {
    user = model('user', {
      name: string().meta((is) => ({
        create: is.required()
      }))
    })
    return db.users.remove()
  })

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
    return graphql(models(user).schema, `
      mutation {
        createUser(name: "Craig") { name }
      }
    `).then(() => spy.called.should.be.ok())
  })

  context('create convenience method', () => {
    it('validates', () =>
      user
        .create({})
        .catch((err) => err.message.should.containEql('"name" is required')))

    it('persists', () =>
      user
        .create({ name: 'Craig' })
        .then(() => db.users.findOne())
        .then((doc) => doc.name.should.equal('Craig')))
  })

  context('update convenience method', () => {
    it('validates', () =>
      user
        .update({ name: 'Craig' })
        .catch((err) => err.message.should.containEql('"_id" is required')))

    it('persists', () =>
      db.users
        .save({ name: 'Craig' })
        .then((doc) =>
          user
            .update({ _id: doc._id.toString(), name: 'Paul' })
            .then(() => db.users.findOne())
            .then((doc) => doc.name.should.equal('Paul'))))
  })

  context('find convenience method', () => {
    xit('validates')

    it('retrieves', () =>
      db.users
        .save({ name: 'Craig' })
        .then(() =>
          user
            .find()
            .then((doc) => doc.name.should.equal('Craig'))))
  })

  context('destroy convenience method', () => {
    xit('validates')

    it('persists', () =>
      db.users
        .save({ name: 'Craig' })
        .then(() =>
          user
            .destroy()
            .then(() => db.users.find())
            .then((docs) => docs.length.should.equal(0))))
  })

  context('where convenience method', () => {
    xit('validates')

    it('retrieves', () =>
      db.users
        .insert([{ name: 'Craig' }, { name: 'Paul' }])
        .then(() =>
          user
            .where({ name: 'Craig' })
            .then((docs) =>
              docs.map((d) => d.name).join('').should.equal('Craig'))))
  })
})
