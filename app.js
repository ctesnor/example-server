const express = require('express');
const mysql = require('mysql');
require('dotenv').config();

const app = express();
app.use(express.json());

// Create MySQL connection pool
const pool = mysql.createPool({
  connectionLimit: 10,
  host: process.env.MYSQL_HOST || 'your-mysql-host',
  user: process.env.MYSQL_USER || 'your-mysql-user',
  password: process.env.MYSQL_PASSWORD || 'your-mysql-password',
  database: process.env.MYSQL_DATABASE || 'your-mysql-database',
  port: process.env.DB_PORT || 3306,
});

// Health check route
app.get('/', (req, res) => {
  console.log('GET / endpoint hit');
  res.send('Server is up and running with MySQL pool!');
});

// Validator function remains unchanged
function validateItems(arr, type) {
  if (!Array.isArray(arr)) {
    return `${type} must be an array.`;
  }
  for (const [index, item] of arr.entries()) {
    if (typeof item !== 'object' || item === null) {
      return `Item at index ${index} in ${type} is not a valid object.`;
    }
    const requiredFields = ['date', 'Sample', 'HZV-1', 'HZV-2'];
    for (const field of requiredFields) {
      if (!(field in item) || typeof item[field] !== 'string' || item[field].trim() === '') {
        return `Field "${field}" missing or invalid in item at index ${index} of ${type}.`;
      }
    }
  }
  return null;
}

// POST endpoint with added logs, error handling
app.post('/liaison_mdx', (req, res, next) => {
  console.log('POST /liaison_mdx endpoint hit');
  console.log('Request body:', JSON.stringify(req.body, null, 2));

  try {
    const { CtValues, ResultValues } = req.body;

    if (!CtValues && !ResultValues) {
      console.warn('Bad request: Missing CtValues and ResultValues');
      return res.status(400).send({ error: 'Request body must include CtValues and/or ResultValues arrays.' });
    }

    let error = CtValues ? validateItems(CtValues, 'CtValues') : null;
    if (!error && ResultValues) error = validateItems(ResultValues, 'ResultValues');
    if (error) {
      console.warn('Validation error:', error);
      return res.status(400).send({ error });
    }

    const itemsToInsert = [];

    if (CtValues) {
      for (const ctValue of CtValues) {
        itemsToInsert.push([
          'CtValue',
          ctValue.date,
          ctValue.Sample,
          ctValue['HZV-1'],
          ctValue['HZV-2'],
        ]);
      }
    }

    if (ResultValues) {
      for (const resValue of ResultValues) {
        itemsToInsert.push([
          'ResultValue',
          resValue.date,
          resValue.Sample,
          resValue['HZV-1'],
          resValue['HZV-2'],
        ]);
      }
    }

    if (itemsToInsert.length === 0) {
      console.warn('No valid items found to insert');
      return res.status(400).send({ error: 'No valid items to insert.' });
    }

    // Bulk insert query
    const sql = 'INSERT INTO liaison_mdx (type, date, Sample, HZV_1, HZV_2) VALUES ?';

    pool.query(sql, [itemsToInsert], (err, results) => {
      if (err) {
        console.error('Database insert error:', err);
        return next(err); // Pass the error to the error-handling middleware
      }

      console.log(`Successfully saved ${results.affectedRows} items.`);
      const savedItems = itemsToInsert.map((values, i) => ({
        id: results.insertId + i,
        type: values[0],
        date: values[1],
        Sample: values[2],
        'HZV-1': values[3],
        'HZV-2': values[4],
      }));

      res.status(201).json(savedItems);
    });
  } catch (error) {
    console.error('Unexpected error in /liaison_mdx handler:', error);
    next(error); // Pass unexpected errors to the error middleware
  }
});

// General error handling middleware (must have 4 args to be recognized)
app.use((err, req, res, next) => {
  console.error('Express error handler caught an error:', err.stack || err);
  res.status(500).json({
    message: 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.message || err : {},
  });
});

module.exports = app;
