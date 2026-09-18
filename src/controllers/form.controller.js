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

const seedDefaultForms = async () => {
  const userAdminForm = await FormDefinition.findOne({ slug: 'user-admin-form' });
  if (!userAdminForm) {
    await FormDefinition.create({
      name: 'User / Admin Form',
      slug: 'user-admin-form',
      description: 'Configure profile fields, RBAC role options, and validation rules for internal team member accounts.',
      isActive: true,
      fields: [
        { id: 'name', name: 'name', label: 'Full Name', type: 'text', placeholder: 'e.g. Rajesh Kumar', validations: [{ type: 'required', message: 'Full Name is required' }], order: 0 },
        { id: 'user_id', name: 'user_id', label: 'Employee / User ID', type: 'text', placeholder: 'e.g. EMP-10492', validations: [{ type: 'required', message: 'Employee ID is required' }], order: 1 },
        { id: 'email', name: 'email', label: 'Email Address', type: 'email', placeholder: 'e.g. rajesh.k@larsentoubro.com', validations: [{ type: 'required', message: 'Email is required' }, { type: 'email', message: 'Valid email required' }], order: 2 },
        { id: 'phonenumber', name: 'phonenumber', label: 'Phone Number', type: 'text', placeholder: 'e.g. +91 98765 43210', validations: [{ type: 'required', message: 'Phone number is required' }], order: 3 },
        { id: 'role', name: 'role', label: 'Account Role', type: 'select', options: [{ label: 'User', value: 'User' }, { label: 'Admin', value: 'Admin' }], validations: [{ type: 'required', message: 'Role is required' }], order: 4 },
        { id: 'password', name: 'password', label: 'Account Password', type: 'password', placeholder: 'Minimum 6 characters', order: 5 },
        { id: 'status', name: 'status', label: 'Account Status', type: 'select', options: [{ label: 'Active', value: 'Active' }, { label: 'Inactive', value: 'Inactive' }], order: 6 }
      ]
    });
  }

  const vendorForm = await FormDefinition.findOne({ slug: 'vendor-form' });
  if (!vendorForm) {
    await FormDefinition.create({
      name: 'Vendor Form',
      slug: 'vendor-form',
      description: 'Configure company entity details, contact person, designation, GST numbers, and vendor status.',
      isActive: true,
      fields: [
        { id: 'name', name: 'name', label: 'Company / Vendor Name', type: 'text', placeholder: 'e.g. RADHE SWAMI CONSTRUCTION', validations: [{ type: 'required', message: 'Company Name is required' }], order: 0 },
        { id: 'vendorCode', name: 'vendorCode', label: 'Vendor Code', type: 'text', placeholder: 'e.g. V-RSC01', validations: [{ type: 'required', message: 'Vendor Code is required' }], order: 1 },
        { id: 'contactPerson', name: 'contactPerson', label: 'Manager / Contact Person', type: 'text', placeholder: 'e.g. Dinesh G', order: 2 },
        { id: 'contactDesignation', name: 'contactDesignation', label: 'Contact Person Designation', type: 'text', placeholder: 'e.g. Site Manager', order: 3 },
        { id: 'contactEmail', name: 'contactEmail', label: 'Company Email Address', type: 'email', placeholder: 'e.g. ybishnugarh@gmail.com', order: 4 },
        { id: 'contactPhone', name: 'contactPhone', label: 'Primary Phone Number', type: 'text', placeholder: 'e.g. 9934110587', validations: [{ type: 'required', message: 'Primary phone is required' }], order: 5 },
        { id: 'alternatePhone', name: 'alternatePhone', label: 'Alternate Phone Number', type: 'text', placeholder: 'e.g. 9876543210', order: 6 },
        { id: 'address', name: 'address', label: 'Office / Site Address', type: 'textarea', placeholder: 'Enter registered address', order: 7 },
        { id: 'gstNumber', name: 'gstNumber', label: 'GST / Tax Identification Number', type: 'text', placeholder: 'e.g. 27AAACL0140P1Z0', order: 8 },
        { id: 'status', name: 'status', label: 'Vendor Status', type: 'select', options: [{ label: 'Active', value: 'Active' }, { label: 'Inactive', value: 'Inactive' }], order: 9 }
      ]
    });
  }
};

export const getForms = async (req, res, next) => {
  try {
    await seedDefaultForms().catch(err => console.error("Error seeding default forms:", err));
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
