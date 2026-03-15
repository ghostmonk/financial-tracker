use crate::db_command;
use crate::models::category::{self, Category, CreateCategoryParams, UpdateCategoryParams};

db_command!(list_categories -> Vec<Category>, category::list_categories);
db_command!(create_category -> Category, category::create_category, params: CreateCategoryParams => move);
db_command!(update_category -> Category, category::update_category, id: String, params: UpdateCategoryParams => move);
db_command!(delete_category -> (), category::delete_category, id: String);
