import { FormDefinition } from '../models/formDefinition.model.js';
import { FormSubmission } from '../models/formSubmission.model.js';
import { z } from 'zod';

/**
 * [SHARED] Dynamic Form Controller
 * Consumed by both Web Application (form.service.ts) and Mobile App (formService.ts).
 */

/**
 * [SHARED] generateZodSchema - Utility to compile dynamic form field definitions into Zod validation schema
 */
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
           if (v.type === 'email' || field.type === 'email') fieldSchema = fieldSchema.regex(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+$/i, { message: v.message || "Email address must contain '@' and '.'" });
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

export const isPermanentRequiredField = (field) => {
  const name = String(field?.name || field?.id || '').toLowerCase().trim();
  const label = String(field?.label || '').toLowerCase().trim();

  const isName = (
    name === 'name' ||
    label === 'name' ||
    label.includes('vendor name') ||
    label.includes('firm name') ||
    label.includes('purchaser name') ||
    label.includes('subcontractor name') ||
    label.includes('company name') ||
    label.includes('full name') ||
    label.includes('supplier name') ||
    label === 'subcontractor / vendor name' ||
    label === 'scrap dealer / firm name' ||
    label === 'supplier / purchaser name'
  );

  const isPrimaryPhone = (
    name === 'contactphone' ||
    name === 'phone' ||
    name === 'phonenumber' ||
    name === 'mobile' ||
    name === 'mobilenumber' ||
    label.includes('primary phone') ||
    label.includes('mobile number') ||
    label === 'phone number' ||
    label.includes('primary phone number')
  ) && !name.includes('alternate') && !label.includes('alternate');

  return isName || isPrimaryPhone;
};

/**
 * [SHARED] createForm - Create or update a dynamic form definition schema
 */
export const createForm = async (req, res, next) => {
  try {
    const { name, slug, description, fields = [] } = req.body;
    let targetSlug = slug;
    if (targetSlug === 'create-user' || targetSlug === 'user-form') {
      targetSlug = 'user-admin-form';
    }
    if (targetSlug === 'vendor-form') {
      targetSlug = 'subcontractor-form';
    }
    
    // Ensure every field has a valid name, label, id, and sequential order
    const sanitizedFields = (fields || []).map((f, idx) => {
      const isPermanent = isPermanentRequiredField(f);
      const isReq = isPermanent || Boolean(f.required || (Array.isArray(f.validations) && f.validations.some(v => v.type === 'required')));
      let vals = f.validations ? [...f.validations] : [];
      if (isReq) {
        if (!vals.some(v => v.type === 'required')) {
          vals.push({ type: 'required', message: `${(f.label || f.name).trim()} is required` });
        }
      } else {
        vals = vals.filter(v => v.type !== 'required');
      }

      return {
        ...f,
        order: idx,
        name: (f.name && f.name.trim()) || (f.label && f.label.toLowerCase().replace(/[^a-z0-9_]/gi, '_')) || `field_${idx}`,
        label: (f.label && f.label.trim()) || `Field ${idx + 1}`,
        required: isReq,
        validations: vals
      };
    });

    const form = await FormDefinition.findOneAndUpdate(
      { slug: targetSlug },
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
        { id: 'status', name: 'status', label: 'Account Status', type: 'select', options: [{ label: 'Active', value: 'Active' }, { label: 'Inactive', value: 'Inactive' }], order: 5 }
      ]
    });
  } else {
    const hasPassword = userAdminForm.fields.some(f => f.name === 'password' || f.id === 'password');
    if (hasPassword) {
      userAdminForm.fields = userAdminForm.fields
        .filter(f => f.name !== 'password' && f.id !== 'password')
        .map((f, idx) => {
          const raw = f.toObject ? f.toObject() : f;
          return { ...raw, order: idx };
        });
      await userAdminForm.save();
    }
  }

  // Permanently remove legacy/duplicate forms (create-user, user-form, vendor-form)
  await FormDefinition.deleteMany({ slug: { $in: ['create-user', 'user-form', 'vendor-form'] } }).catch(() => {});

  let toolForm = await FormDefinition.findOne({ slug: 'tool-form' });
  if (!toolForm) {
    await FormDefinition.create({
      name: 'Tool & Inspection Form',
      slug: 'tool-form',
      description: 'Configure customizable tool fields, dynamic validation periods (1 Year, 2 Years, 3 Years), and inspection options.',
      isActive: true,
      fields: [
        { id: 'description', name: 'description', label: 'Tool Description', type: 'text', placeholder: 'e.g. Tirfor 3.2 Ton', validations: [{ type: 'required', message: 'Description is required' }], order: 0 },
        {
          id: 'validation',
          name: 'validation',
          label: 'Validation Period',
          type: 'select',
          options: [
            { label: '1 Year', value: '1 Year' },
            { label: '2 Years', value: '2 Years' },
            { label: '3 Years', value: '3 Years' }
          ],
          validations: [{ type: 'required', message: 'Validation period is required' }],
          order: 1
        },
        { id: 'dateOfSupply', name: 'dateOfSupply', label: 'Date of Supply', type: 'date', order: 2 },
        { id: 'remarks', name: 'remarks', label: 'Remarks / Notes', type: 'textarea', placeholder: 'Inspection remarks', order: 3 }
      ]
    });
  } else {
    let valField = toolForm.fields.find(f => f.name === 'validation' || f.id === 'validation');
    if (!valField) {
      toolForm.fields.push({
        id: 'validation',
        name: 'validation',
        label: 'Validation Period',
        type: 'select',
        options: [
          { label: '1 Year', value: '1 Year' },
          { label: '2 Years', value: '2 Years' },
          { label: '3 Years', value: '3 Years' }
        ],
        validations: [{ type: 'required', message: 'Validation period is required' }],
        order: toolForm.fields.length
      });
      await toolForm.save();
    } else if (!valField.options || valField.options.length === 0) {
      valField.options = [
        { label: '1 Year', value: '1 Year' },
        { label: '2 Years', value: '2 Years' },
        { label: '3 Years', value: '3 Years' }
      ];
      await toolForm.save();
    }
  }
};

/**
 * [SHARED] getForms - Fetch all active form definitions
 */
export const getForms = async (req, res, next) => {
  try {
    await seedDefaultForms().catch(err => console.error("Error seeding default forms:", err));
    // Permanently remove legacy/duplicate forms (create-user, user-form, vendor-form)
    await FormDefinition.deleteMany({ slug: { $in: ['create-user', 'user-form', 'vendor-form'] } }).catch(() => {});
    const forms = await FormDefinition.find({
      isActive: true,
      slug: { $nin: ['create-user', 'user-form', 'vendor-form'] }
    }).select('-fields');
    res.status(200).json({ success: true, data: forms });
  } catch (error) {
    next(error);
  }
};

/**
 * [SHARED] getFormBySlug - Fetch full schema and field definitions by form slug
 */
export const getFormBySlug = async (req, res, next) => {
  try {
    let { slug } = req.params;
    // Map legacy create-user or user-form to the unified user-admin-form
    if (slug === 'create-user' || slug === 'user-form') {
      slug = 'user-admin-form';
    }
    // Map legacy vendor-form to subcontractor-form
    if (slug === 'vendor-form') {
      slug = 'subcontractor-form';
    }
    await seedDefaultForms().catch(err => console.error("Error seeding default forms:", err));
    const form = await FormDefinition.findOne({ slug, isActive: true });
    
    if (!form) {
      return res.status(404).json({ success: false, message: 'Form not found' });
    }
    
    res.status(200).json({ success: true, data: form });
  } catch (error) {
    next(error);
  }
};

/**
 * [SHARED] submitForm - Validate submitted dynamic form data against schema and persist entry
 */
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
