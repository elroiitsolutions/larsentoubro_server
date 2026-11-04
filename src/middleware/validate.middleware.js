export const validate = (schema) => (req, res, next) => {
    try {
        schema.parse({
            body: req.body,
            query: req.query,
            params: req.params,
        });
        next();
    } catch (error) {
        const firstMessage = error.errors?.[0]?.message || 'Validation Error';
        res.status(400).json({
            success: false,
            message: firstMessage,
            errors: error.errors
        });
    }
};
