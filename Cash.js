'use strict';
const AWS = require('aws-sdk');
const DDB = new AWS.DynamoDB.DocumentClient();

module.exports.handler = async event => {

  const body = JSON.parse(event.body);

  const {id} = body;

  const {cacheSettings = {cache: true, TTL: 5, save: true} } = body;
  const {cache = true, TTL = 5, save = true} = cacheSettings;

  if (id === undefined || id === null) {
    return {
      statusCode: 403,
      body: JSON.stringify(
        {
          message: "id property not found in request body"
        },
      ),
    };
  }

  let data;
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
  const data = await DDB.get(params).promise();
  return data;
}

async function putData(id, key, TTL) {
  const params = {
    TableName: process.env.DB,
    Item: {
      ID: `${id}`,
      KEY: key,
      TTL
    },
    ReturnValues: "ALL_OLD"
  };

  const data = await DDB.put(params).promise();
  return {Item: {ID: id, TTL, KEY: key}};
}