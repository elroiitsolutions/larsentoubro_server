import mongoose from 'mongoose';

const validationRuleSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: [
      'required',
      'minLength',
      'maxLength',
      'min',
      'max',
      'email',
      'url',
      'regex',
      'alphanumeric', // Added alphanumeric
      'custom',
    ],
  },
  value: mongoose.Schema.Types.Mixed,
  message: { type: String, required: true },
}, { _id: false });

const conditionSchema = new mongoose.Schema({
  fieldId: { type: String, required: true },
  operator: {
    type: String,
    required: true,
    enum: ['equals', 'notEquals', 'contains', 'greaterThan', 'lessThan', 'exists', 'notExists'],
  },
  value: mongoose.Schema.Types.Mixed,
}, { _id: false });

const fieldSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  label: { type: String, required: true },
  type: {
    type: String,
    required: true,
    enum: [
      'text',
      'number',
      'email',
      'password',
      'date',
      'select',
      'radio',
      'checkbox',
      'textarea',
      'file',
      'switch',
    ],
  },
  placeholder: String,
  defaultValue: mongoose.Schema.Types.Mixed,
  helperText: String,
  options: [{
    label: String,
    value: String,
  }],
  validations: [validationRuleSchema],
  conditions: [conditionSchema],
  group: String,
  order: { type: Number, default: 0 },
  disabled: { type: Boolean, default: false },
  readOnly: { type: Boolean, default: false },
}, { _id: false });

const formDefinitionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  description: String,
  version: { type: Number, default: 1 },
  isActive: { type: Boolean, default: true },
  fields: [fieldSchema],
}, { timestamps: true });

export const FormDefinition = mongoose.model('FormDefinition', formDefinitionSchema);
