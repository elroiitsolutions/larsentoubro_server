import { FormDefinition } from '../models/formDefinition.model.js';
import { FormSubmission } from '../models/formSubmission.model.js';
import { z } from 'zod';

const generateZodSchema = (fields) => {
  const schemaShape = {};

  fields.forEach(field => {
    let fieldSchema;
    
    switch (field.type) {
      case 'number':
        fieldSchema = z.number();
        break;
      case 'checkbox':
        fieldSchema = z.boolean().or(z.array(z.string()));
        break;
      default:
        fieldSchema = z.string();
    }

    if (field.validations && field.validations.length > 0) {
      let isRequired = false;
      field.validations.forEach(v => {
        if (v.type === 'required') {
          isRequired = true;
          fieldSchema = fieldSchema.min(1, { message: v.message || 'Required' });
        }
        if (field.type !== 'number' && typeof fieldSchema.min === 'function') {
           if (v.type === 'minLength') fieldSchema = fieldSchema.min(v.value, { message: v.message });
           if (v.type === 'maxLength') fieldSchema = fieldSchema.max(v.value, { message: v.message });
           if (v.type === 'email') fieldSchema = fieldSchema.email({ message: v.message });
           if (v.type === 'url') fieldSchema = fieldSchema.url({ message: v.message });
           if (v.type === 'regex') fieldSchema = fieldSchema.regex(new RegExp(v.value), { message: v.message });
           // Alphanumeric support
           if (v.type === 'alphanumeric') fieldSchema = fieldSchema.regex(/^[a-zA-Z0-9\s]*$/, { message: v.message || 'Must be alphanumeric' });
        }
        if (field.type === 'number') {
           if (v.type === 'min') fieldSchema = fieldSchema.min(v.value, { message: v.message });
           if (v.type === 'max') fieldSchema = fieldSchema.max(v.value, { message: v.message });
        }
      });

      if (!isRequired) {
        fieldSchema = fieldSchema.optional();
      }
    } else {
      fieldSchema = fieldSchema.optional();
    }

    schemaShape[field.name] = fieldSchema;
  });

  return z.object(schemaShape);
};

export const createForm = async (req, res, next) => {
  try {
    const { name, slug, description, fields = [] } = req.body;
    
    // Ensure every field has a valid name, label, id, and sequential order
    const sanitizedFields = (fields || []).map((f, idx) => ({
      ...f,
      order: idx,
      name: (f.name && f.name.trim()) || (f.label && f.label.toLowerCase().replace(/[^a-z0-9_]/gi, '_')) || `field_${idx}`,
      label: (f.label && f.label.trim()) || `Field ${idx + 1}`
    }));

    const form = await FormDefinition.findOneAndUpdate(
      { slug },
      {
        $set: {
          name,
          description,
          fields: sanitizedFields,
          isActive: true
        },
        $inc: { version: 1 }
      },
      { new: true, upsert: true, runValidators: true }
    );

    res.status(200).json({ success: true, data: form });
  } catch (error) {
    next(error);
  }
};

export const getForms = async (req, res, next) => {
  try {
    const forms = await FormDefinition.find({ isActive: true }).select('-fields');
    res.status(200).json({ success: true, data: forms });
  } catch (error) {
    next(error);
  }
};

export const getFormBySlug = async (req, res, next) => {
  try {
    const { slug } = req.params;
    const form = await FormDefinition.findOne({ slug, isActive: true });
    
    if (!form) {
      return res.status(404).json({ success: false, message: 'Form not found' });
    }
    
    res.status(200).json({ success: true, data: form });
  } catch (error) {
    next(error);
  }
};

export const submitForm = async (req, res, next) => {
  try {
    const { slug } = req.params;
    const formData = req.body;

    const form = await FormDefinition.findOne({ slug, isActive: true });
    if (!form) {
      return res.status(404).json({ success: false, message: 'Form not found' });
    }

    const dynamicSchema = generateZodSchema(form.fields);
    const validationResult = dynamicSchema.safeParse(formData);

    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationResult.error.format()
      });
    }

    const submission = new FormSubmission({
      formId: form._id,
      data: validationResult.data,
    });

    await submission.save();
    res.status(201).json({ success: true, data: submission });
  } catch (error) {
    next(error);
  }
};
