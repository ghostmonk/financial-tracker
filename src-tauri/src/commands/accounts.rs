use crate::db_command;
use crate::models::account::{self, Account, CreateAccountParams, UpdateAccountParams};

db_command!(list_accounts -> Vec<Account>, account::list_accounts);
db_command!(create_account -> Account, account::create_account, params: CreateAccountParams => move);
db_command!(update_account -> Account, account::update_account, id: String, params: UpdateAccountParams => move);
db_command!(delete_account -> (), account::delete_account, id: String);
