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
    date: String,
    Sample: String,
    "HZV-1": String,
    "HZV-2": String,
}, { collection: 'liaison_mdx' });

const Item = mongoose.model('Item', itemSchema);

// Health check route
app.get('/', (req, res) => {
    console.log('GET / endpoint hit');
    res.send('Server is up and running!');
});

// POST endpoint to save single item (CtValue or ResultValue)
app.post('/liaison_mdx', async (req, res) => {
    console.log('POST /liaison_mdx endpoint hit with body:', req.body);

    // Validate the incoming object
    if (!req.body.type || !['CtValue', 'ResultValue'].includes(req.body.type)) {
        return res.status(400).send({ error: 'Invalid or missing "type" property. Must be "CtValue" or "ResultValue".' });
    }

    try {
        const newItem = new Item(req.body);
        const savedItem = await newItem.save();
        console.log('Saved new item to database:', savedItem);
        res.status(201).send(savedItem);
    } catch (error) {
        console.error('Error saving item:', error);
        res.status(400).send({ error: error.message });
    }
});

module.exports = app;
