// server.js

const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();

// Middleware to parse JSON requests
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => {
    console.log('Connected to MongoDB');
})
.catch((error) => {
    console.error('MongoDB connection error:', error);
});

// Schema for single CtValue or ResultValue entry
const itemSchema = new mongoose.Schema({
    type: { type: String, required: true, enum: ['CtValue', 'ResultValue'] },
    date: { type: String, required: true },
    Sample: { type: String, required: true },
    "HZV-1": { type: String, required: true },
    "HZV-2": { type: String, required: true },
}, { collection: 'liaison_mdx' });

const Item = mongoose.model('Item', itemSchema);

// Health check route
app.get('/', (req, res) => {
    console.log('GET / endpoint hit');
    res.send('Server is up and running!');
});

// POST endpoint to save multiple CtValue and ResultValue items
app.post('/liaison_mdx', async (req, res) => {
    console.log('Incoming request body:', JSON.stringify(req.body, null, 2));

    const { CtValues, ResultValues } = req.body;

    if (!CtValues && !ResultValues) {
        return res.status(400).send({ error: 'Request body must include CtValues and/or ResultValues arrays.' });
    }

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

    // Validate CtValues if present
    let error = CtValues ? validateItems(CtValues, 'CtValues') : null;
    if (!error && ResultValues) error = validateItems(ResultValues, 'ResultValues');
    if (error) return res.status(400).send({ error });

    // Prepare items with type field
    const itemsToInsert = [];

    if (CtValues) {
        for (const ctValue of CtValues) {
            itemsToInsert.push({ ...ctValue, type: 'CtValue' });
        }
    }

    if (ResultValues) {
        for (const resValue of ResultValues) {
            itemsToInsert.push({ ...resValue, type: 'ResultValue' });
        }
    }

    try {
        const savedItems = await Item.insertMany(itemsToInsert);
        console.log(`Successfully saved ${savedItems.length} items.`);
        res.status(201).json(savedItems);
    } catch (err) {
        console.error('Error saving items:', err);
        res.status(500).send({ error: 'Error saving items to database.' });
    }
});

module.exports = app;
