'use strict';
const AWS = require('aws-sdk');
const DDB = new AWS.DynamoDB.DocumentClient();

const middy = require('@middy/core');
const jsonBodyParser = require('@middy/http-json-body-parser');
const httpErrorHandler = require('@middy/http-error-handler');
var createError = require('http-errors');
const validator = require('@middy/validator');

const inputSchema = {
  type: 'object',
  properties: {
    body: {
      type: 'object',
      required: ['id'],
      properties: {
        id: {type: 'string', minLength: 1},
        cacheSettings: {
          type: 'object',
          properties: {
            cache: {type: 'boolean'},
            save: {type: 'boolean'},
            TTL: {type: 'integer', minimum: 1}
          }
        }
      }
    }
  }
}

const cash = async event => {

  const {id} = event.body;

  const {cacheSettings = {cache: true, TTL: 5, save: true} } = event.body;
  const {cache = true, TTL = 5, save = true} = cacheSettings;

  let data = {};
  let fromCache = true;

  //if requested cache, check for value
  if (cache === true) {
    //get from cache
    data = await getData(id);
  }

  //if not found in cache, fetch from source
  if (data.Item === undefined || new Date().getTime()/1000 > data.Item.TTL) {
    fromCache = false;
    //simulate fetching data
    const KEY = new Date().toISOString();

    //calculate DDB TTL
    const calculatedTTL = (new Date().getTime()/1000) + TTL;
    //if save to cache
    if (save) {
      //save to cache
      data = await putData(id, KEY, calculatedTTL);
    } else {
      //just format fetched data
      data = {Item: {ID: id, KEY, TTL: String(calculatedTTL)}};
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify(
      {
        item: data.Item,
        fromCache,
        cacheSettings: {
          cache,
          TTL,
          save
        },
      },
    ),
  };

};

async function getData(id) {
  const params = {
    TableName: process.env.DB,
    Key: {
      ID: `${id}`,
    },
  }; 
  let data;
  try {
    data = await DDB.get(params).promise();
  } catch (error) {
    console.log(error);
    throw createError.InternalServerError("DATABASE ERROR");
  }
  return data;
}

async function putData(id, key, TTL) {
  const params = {
    TableName: process.env.DB,
    Item: {
      ID: `${id}`,
      KEY: key,
      TTL
    }
  };

  try {
    const data = await DDB.put(params).promise();
  } catch (error) {
    console.log(error);
    throw createError.InternalServerError("DATABASE ERROR");
  }
  return {Item: {ID: id, TTL, KEY: key}};
}

const handler = middy(cash)
  .use(jsonBodyParser())
  .use(validator({inputSchema}))
  .use(httpErrorHandler());

module.exports = { handler };