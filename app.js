const express = require('express');
const { Pool } = require('pg'); // import pg Pool
require('dotenv').config();

const app = express();
app.use(express.json());


const pool = new Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT ? parseInt(process.env.PG_PORT) : 5432,
  max: 1000,
  idleTimeoutMillis: 30000,       // 30 seconds
  connectionTimeoutMillis: 2000,  // 2 seconds
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});



// Health check route
app.get('/', (req, res) => {
  console.log('GET / endpoint hit');
  res.send('Server is up and running with PostgreSQL pool!');
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
app.post('/liaison_mdx', async (req, res, next) => {
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

    // PostgreSQL bulk insert: construct parameterized query dynamically
    // with proper placeholders ($1, $2, ...). Each row has 5 columns.
    const values = [];
    const placeholders = itemsToInsert.map((item, i) => {
      const pos = i * 5;
      values.push(...item);
      return `($${pos + 1}, $${pos + 2}, $${pos + 3}, $${pos + 4}, $${pos + 5})`;
    }).join(', ');

    const sql = `INSERT INTO mdx_test ("type", "date", "sample", "HZV-1", "HZV-2") VALUES ${placeholders} RETURNING *`;

    const result = await pool.query(sql, values);

    console.log(`Successfully saved ${result.rowCount} items.`);

    // Build the response from result.rows
    const savedItems = result.rows.map(row => ({
      id: row.id,
      type: row.type,
      date: row.date,
      Sample: row.Sample,
      'HZV-1': row.HZV_1,
      'HZV-2': row.HZV_2,
    }));

    res.status(201).json(savedItems);
  } catch (error) {
    console.error('Unexpected error in /liaison_mdx handler:', error);
    next(error); // Pass unexpected errors to error middleware
  }
});

// General error handling middleware
app.use((err, req, res, next) => {
  console.error('Express error handler caught an error:', err.stack || err);
  res.status(500).json({
    message: 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.message || err : {},
  });
});

module.exports = app;
