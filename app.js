app.post('/liaison_mdx', async (req, res) => {
    console.log('POST /liaison_mdx endpoint hit with body:', req.body);

    const { CtValues, ResultValues } = req.body;

    if (!CtValues && !ResultValues) {
        return res.status(400).send({ error: 'Request body must contain CtValues and/or ResultValues arrays.' });
    }

    // Helper function to validate items
    function validateItemArray(arr, type) {
        if (!Array.isArray(arr)) {
            return `${type} must be an array.`;
        }
        for (const item of arr) {
            if (typeof item !== 'object' || !item.date || !item.Sample || !item['HZV-1'] || !item['HZV-2']) {
                return `Each item in ${type} array must be an object with date, Sample, HZV-1, and HZV-2 fields.`;
            }
        }
        return null;
    }

    // Validate CtValues and ResultValues contents if present
    let error = null;
    if (CtValues) error = validateItemArray(CtValues, 'CtValues');
    if (!error && ResultValues) error = validateItemArray(ResultValues, 'ResultValues');
    if (error) return res.status(400).send({ error });

    const itemsToInsert = [];

    if (CtValues) {
        for (const ctValue of CtValues) {
            itemsToInsert.push({ ...ctValue, type: 'CtValue' });
        }
    }

    if (ResultValues) {
        for (const resultValue of ResultValues) {
            itemsToInsert.push({ ...resultValue, type: 'ResultValue' });
        }
    }

    try {
        const savedItems = await Item.insertMany(itemsToInsert);
        console.log(`Saved ${savedItems.length} items to the database.`);
        res.status(201).send(savedItems);
    } catch (error) {
        console.error('Error saving items:', error);
        res.status(500).send({ error: 'Failed to save items to database.' });
    }
});
