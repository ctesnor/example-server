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

// Validator function updated for VZV and HSV assays
function validateItems(arr, type, assayName) {
  if (!Array.isArray(arr)) {
    return `${type} must be an array.`;
  }

  for (const [index, item] of arr.entries()) {
    if (typeof item !== 'object' || item === null) {
      return `Item at index ${index} in ${type} is not a valid object.`;
    }

    const commonFields = ['date', 'Sample'];
    for (const field of commonFields) {
      if (!(field in item) || typeof item[field] !== 'string' || item[field].trim() === '') {
        return `Field "${field}" missing or invalid in item at index ${index} of ${type}.`;
      }
    }

    if (assayName && assayName.includes('VZV')) {
      if (!('VZV' in item) || typeof item.VZV !== 'string') {
        return `Field "VZV" missing or invalid in item at index ${index} of ${type}.`;
      }
    } else if (assayName && assayName.includes('HSV')) {
      const hsvFields = ['HSV-1', 'HSV-2'];
      for (const field of hsvFields) {
        if (!(field in item) || typeof item[field] !== 'string') {
          return `Field "${field}" missing or invalid in item at index ${index} of ${type}.`;
        }
      }
    }
    // Else: no further assay-specific validation
  }
  return null;
}

// POST endpoint with VZV and HSV support
app.post('/liaison_mdx', async (req, res, next) => {
  console.log('POST /liaison_mdx endpoint hit');
  console.log('Request body:', JSON.stringify(req.body, null, 2));

  try {
    const { AssayName, CtValues, ResultValues } = req.body;

    if (!CtValues && !ResultValues) {
      console.warn('Bad request: Missing CtValues and ResultValues');
      return res.status(400).send({ error: 'Request body must include CtValues and/or ResultValues arrays.' });
    }

    // Validate based on assay
    let error = CtValues ? validateItems(CtValues, 'CtValues', AssayName) : null;
    if (!error && ResultValues) error = validateItems(ResultValues, 'ResultValues', AssayName);
    if (error) {
      console.warn('Validation error:', error);
      return res.status(400).send({ error });
    }

    const itemsToInsert = [];

    if (CtValues) {
      for (const ctValue of CtValues) {
        if (AssayName && AssayName.includes('VZV')) {
          itemsToInsert.push([
            'CtValue',
            ctValue.date,
            ctValue.Sample,
            ctValue.VZV || null,
            null,
            null,
          ]);
        } else if (AssayName && AssayName.includes('HSV')) {
          itemsToInsert.push([
            'CtValue',
            ctValue.date,
            ctValue.Sample,
            null,
            ctValue['HSV-1'] || null,
            ctValue['HSV-2'] || null,
          ]);
        } else {
          // fallback: insert what is available
          itemsToInsert.push([
            'CtValue',
            ctValue.date,
            ctValue.Sample,
            ctValue.VZV || null,
            ctValue['HSV-1'] || null,
            ctValue['HSV-2'] || null,
          ]);
        }
      }
    }

    if (ResultValues) {
      for (const resValue of ResultValues) {
        if (AssayName && AssayName.includes('VZV')) {
          itemsToInsert.push([
            'ResultValue',
            resValue.date,
            resValue.Sample,
            resValue.VZV || null,
            null,
            null,
          ]);
        } else if (AssayName && AssayName.includes('HSV')) {
          itemsToInsert.push([
            'ResultValue',
            resValue.date,
            resValue.Sample,
            null,
            resValue['HSV-1'] || null,
            resValue['HSV-2'] || null,
          ]);
        } else {
          itemsToInsert.push([
            'ResultValue',
            resValue.date,
            resValue.Sample,
            resValue.VZV || null,
            resValue['HSV-1'] || null,
            resValue['HSV-2'] || null,
          ]);
        }
      }
    }

    if (itemsToInsert.length === 0) {
      console.warn('No valid items found to insert');
      return res.status(400).send({ error: 'No valid items to insert.' });
    }

    // Each row has 6 columns: type, date, sample, vzv, hsv_1, hsv_2
    const values = [];
    const placeholders = itemsToInsert.map((item, i) => {
      const pos = i * 6;
      values.push(...item);
      return `($${pos + 1}, $${pos + 2}, $${pos + 3}, $${pos + 4}, $${pos + 5}, $${pos + 6})`;
    }).join(', ');

    const sql = `INSERT INTO mdx_test ("type", "date", "sample", "vzv", "hsv_1", "hsv_2") VALUES ${placeholders} RETURNING *`;

    const result = await pool.query(sql, values);

    console.log(`Successfully saved ${result.rowCount} items.`);

    const savedItems = result.rows.map(row => ({
      id: row.id,
      type: row.type,
      date: row.date,
      Sample: row.sample,
      VZV: row.vzv,
      'HSV-1': row.hsv_1,
      'HSV-2': row.hsv_2,
    }));

    res.status(201).json(savedItems);

  } catch (error) {
    console.error('Unexpected error in /liaison_mdx handler:', error);
    next(error);
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
