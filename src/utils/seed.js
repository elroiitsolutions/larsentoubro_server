import { FormDefinition } from '../models/formDefinition.model.js';

const defaultForms = [
  {
    name: "Create Project",
    slug: "create-project",
    description: "Form for creating a new project",
    isActive: true,
    version: 1,
    fields: [
      { id: "f_proj_1", name: "projectName", label: "Project Name", type: "text", order: 0, validations: [{ type: 'required', message: 'Project Name is required' }] },
      { id: "f_proj_2", name: "projectCode", label: "Project Code", type: "text", order: 1, validations: [{ type: 'required', message: 'Project Code is required' }] },
      { id: "f_proj_3", name: "budget", label: "Budget", type: "number", order: 2 },
    ]
  },
  {
    name: "Create Store",
    slug: "create-store",
    description: "Form for creating a new store",
    isActive: true,
    version: 1,
    fields: [
      { id: "f_store_1", name: "storeName", label: "Store Name", type: "text", order: 0, validations: [{ type: 'required', message: 'Store Name is required' }] },
      { id: "f_store_2", name: "location", label: "Location", type: "text", order: 1, validations: [{ type: 'required', message: 'Location is required' }] },
      { id: "f_store_3", name: "manager", label: "Manager Name", type: "text", order: 2 },
    ]
  },
  {
    name: "Create User",
    slug: "create-user",
    description: "Form for creating a new user",
    isActive: true,
    version: 1,
    fields: [
      { id: "f_user_1", name: "name", label: "Full Name", type: "text", order: 0, validations: [{ type: 'required', message: 'Name is required' }] },
      { id: "f_user_2", name: "user_id", label: "User ID", type: "text", order: 1, validations: [{ type: 'required', message: 'User ID is required' }] },
      { id: "f_user_3", name: "email", label: "Email Address", type: "email", order: 2, validations: [{ type: 'required', message: 'Email is required' }] },
      { id: "f_user_4", name: "phonenumber", label: "Phone Number", type: "text", order: 3, validations: [{ type: 'required', message: 'Phone is required' }] },
      { id: "f_user_5", name: "password", label: "Password", type: "text", order: 4, validations: [{ type: 'required', message: 'Password is required' }] },
      { id: "f_user_6", name: "role", label: "Role", type: "select", order: 5, options: [{ label: "Admin", value: "Admin" }, { label: "Manager", value: "Manager" }, { label: "Engineer", value: "Engineer" }, { label: "Analyst", value: "Analyst" }, { label: "Viewer", value: "Viewer" }] },
    ]
  }
];

export const seedDatabase = async () => {
  try {
    for (const form of defaultForms) {
      const existing = await FormDefinition.findOne({ slug: form.slug, isActive: true });
      if (!existing) {
        await FormDefinition.create(form);
        console.log(`[Seed] Created default form: ${form.slug}`);
      }
    }
  } catch (error) {
    console.error('[Seed] Error seeding database:', error);
  }
};
