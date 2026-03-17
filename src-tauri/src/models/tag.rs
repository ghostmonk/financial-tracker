use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::db::DbError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub created_at: String,
}

const SELECT_COLS: &str = "id, name, slug, created_at";

fn row_to_tag(row: &rusqlite::Row) -> rusqlite::Result<Tag> {
    Ok(Tag {
        id: row.get(0)?,
        name: row.get(1)?,
        slug: row.get(2)?,
        created_at: row.get(3)?,
    })
}

fn slugify(name: &str) -> String {
    let raw: String = name
        .to_lowercase()
        .replace(' ', "-")
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-')
        .collect();
    raw.split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

pub fn create_tag(conn: &Connection, name: &str, slug: &str) -> Result<Tag, DbError> {
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO tags (id, name, slug) VALUES (?1, ?2, ?3)",
        params![id, name, slug],
    )?;

    let mut stmt = conn.prepare(&format!("SELECT {} FROM tags WHERE id = ?1", SELECT_COLS))?;
    Ok(stmt.query_row(params![id], row_to_tag)?)
}

pub fn list_tags(conn: &Connection) -> Result<Vec<Tag>, DbError> {
    let mut stmt = conn.prepare(&format!("SELECT {} FROM tags ORDER BY name", SELECT_COLS))?;
    let tags = stmt
        .query_map([], row_to_tag)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(tags)
}

pub fn delete_tag(conn: &Connection, id: &str) -> Result<(), DbError> {
    conn.execute("DELETE FROM tags WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn get_or_create_tag(conn: &Connection, name: &str) -> Result<Tag, DbError> {
    let slug = slugify(name);
    let mut stmt = conn.prepare(&format!("SELECT {} FROM tags WHERE slug = ?1", SELECT_COLS))?;
    let result = stmt.query_row(params![slug], row_to_tag);
    match result {
        Ok(tag) => Ok(tag),
        Err(rusqlite::Error::QueryReturnedNoRows) => create_tag(conn, name, &slug),
        Err(e) => Err(DbError::from(e)),
    }
}

pub fn add_tags_to_transaction(
    conn: &Connection,
    transaction_id: &str,
    tag_ids: &[String],
) -> Result<(), DbError> {
    let mut stmt = conn.prepare(
        "INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?1, ?2)",
    )?;
    for tag_id in tag_ids {
        stmt.execute(params![transaction_id, tag_id])?;
    }
    Ok(())
}

pub fn remove_tags_from_transaction(
    conn: &Connection,
    transaction_id: &str,
    tag_ids: &[String],
) -> Result<(), DbError> {
    let mut stmt =
        conn.prepare("DELETE FROM transaction_tags WHERE transaction_id = ?1 AND tag_id = ?2")?;
    for tag_id in tag_ids {
        stmt.execute(params![transaction_id, tag_id])?;
    }
    Ok(())
}

pub fn set_transaction_tags(
    conn: &Connection,
    transaction_id: &str,
    tag_ids: &[String],
) -> Result<(), DbError> {
    conn.execute(
        "DELETE FROM transaction_tags WHERE transaction_id = ?1",
        params![transaction_id],
    )?;
    add_tags_to_transaction(conn, transaction_id, tag_ids)
}

pub fn get_transaction_tags(conn: &Connection, transaction_id: &str) -> Result<Vec<Tag>, DbError> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.name, t.slug, t.created_at FROM tags t \
         INNER JOIN transaction_tags tt ON t.id = tt.tag_id \
         WHERE tt.transaction_id = ?1 ORDER BY t.name",
    )?;
    let tags = stmt
        .query_map(params![transaction_id], row_to_tag)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(tags)
}

pub fn list_transactions_by_tag(conn: &Connection, tag_id: &str) -> Result<Vec<String>, DbError> {
    let mut stmt = conn.prepare("SELECT transaction_id FROM transaction_tags WHERE tag_id = ?1")?;
    let ids = stmt
        .query_map(params![tag_id], |row| row.get(0))?
        .collect::<rusqlite::Result<Vec<String>>>()?;
    Ok(ids)
}

static SEED_TAGS: &[(&str, &str)] = &[
    ("Work", "work"),
    ("Vacation", "vacation"),
    ("Reimbursable", "reimbursable"),
    ("Tax Deductible", "tax-deductible"),
    ("Medical", "medical"),
    ("Family", "family"),
];

pub fn seed_default_tags(conn: &Connection) -> Result<(), DbError> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM tags", [], |row| row.get(0))?;
    if count > 0 {
        return Ok(());
    }

    for (name, slug) in SEED_TAGS {
        conn.execute(
            "INSERT INTO tags (id, name, slug) VALUES (?1, ?2, ?3)",
            params![Uuid::new_v4().to_string(), name, slug],
        )?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_utils::fixtures::{insert_test_transaction, setup_db};

    #[test]
    fn test_create_and_list_tags() {
        let conn = setup_db();

        let tag = create_tag(&conn, "Work", "work").unwrap();
        assert_eq!(tag.name, "Work");
        assert_eq!(tag.slug, "work");

        create_tag(&conn, "Vacation", "vacation").unwrap();

        let tags = list_tags(&conn).unwrap();
        assert_eq!(tags.len(), 2);
        assert_eq!(tags[0].name, "Vacation");
        assert_eq!(tags[1].name, "Work");
    }

    #[test]
    fn test_delete_tag() {
        let conn = setup_db();

        let tag = create_tag(&conn, "Work", "work").unwrap();
        delete_tag(&conn, &tag.id).unwrap();

        let tags = list_tags(&conn).unwrap();
        assert!(tags.is_empty());
    }

    #[test]
    fn test_get_or_create_tag() {
        let conn = setup_db();

        let tag1 = get_or_create_tag(&conn, "Tax Deductible").unwrap();
        assert_eq!(tag1.slug, "tax-deductible");

        let tag2 = get_or_create_tag(&conn, "Tax Deductible").unwrap();
        assert_eq!(tag1.id, tag2.id);

        let tags = list_tags(&conn).unwrap();
        assert_eq!(tags.len(), 1);
    }

    #[test]
    fn test_slugify() {
        assert_eq!(slugify("Tax Deductible"), "tax-deductible");
        assert_eq!(slugify("Work"), "work");
        assert_eq!(slugify("Hello World!"), "hello-world");
        assert_eq!(slugify("A & B"), "a-b");
    }

    #[test]
    fn test_add_and_get_transaction_tags() {
        let conn = setup_db();
        insert_test_transaction(&conn, "txn-1");

        let t1 = create_tag(&conn, "Work", "work").unwrap();
        let t2 = create_tag(&conn, "Medical", "medical").unwrap();

        add_tags_to_transaction(&conn, "txn-1", &[t1.id.clone(), t2.id.clone()]).unwrap();

        let tags = get_transaction_tags(&conn, "txn-1").unwrap();
        assert_eq!(tags.len(), 2);

        // Idempotent — adding again should not fail
        add_tags_to_transaction(&conn, "txn-1", &[t1.id.clone()]).unwrap();
        let tags = get_transaction_tags(&conn, "txn-1").unwrap();
        assert_eq!(tags.len(), 2);
    }

    #[test]
    fn test_remove_tags_from_transaction() {
        let conn = setup_db();
        insert_test_transaction(&conn, "txn-1");

        let t1 = create_tag(&conn, "Work", "work").unwrap();
        let t2 = create_tag(&conn, "Medical", "medical").unwrap();

        add_tags_to_transaction(&conn, "txn-1", &[t1.id.clone(), t2.id.clone()]).unwrap();
        remove_tags_from_transaction(&conn, "txn-1", &[t1.id.clone()]).unwrap();

        let tags = get_transaction_tags(&conn, "txn-1").unwrap();
        assert_eq!(tags.len(), 1);
        assert_eq!(tags[0].slug, "medical");
    }

    #[test]
    fn test_set_transaction_tags() {
        let conn = setup_db();
        insert_test_transaction(&conn, "txn-1");

        let t1 = create_tag(&conn, "Work", "work").unwrap();
        let t2 = create_tag(&conn, "Medical", "medical").unwrap();
        let t3 = create_tag(&conn, "Family", "family").unwrap();

        add_tags_to_transaction(&conn, "txn-1", &[t1.id.clone(), t2.id.clone()]).unwrap();

        // Replace all with just t3
        set_transaction_tags(&conn, "txn-1", &[t3.id.clone()]).unwrap();

        let tags = get_transaction_tags(&conn, "txn-1").unwrap();
        assert_eq!(tags.len(), 1);
        assert_eq!(tags[0].slug, "family");
    }

    #[test]
    fn test_list_transactions_by_tag() {
        let conn = setup_db();
        insert_test_transaction(&conn, "txn-1");
        insert_test_transaction(&conn, "txn-2");

        let t1 = create_tag(&conn, "Work", "work").unwrap();

        add_tags_to_transaction(&conn, "txn-1", &[t1.id.clone()]).unwrap();
        add_tags_to_transaction(&conn, "txn-2", &[t1.id.clone()]).unwrap();

        let ids = list_transactions_by_tag(&conn, &t1.id).unwrap();
        assert_eq!(ids.len(), 2);
        assert!(ids.contains(&"txn-1".to_string()));
        assert!(ids.contains(&"txn-2".to_string()));
    }

    #[test]
    fn test_seed_default_tags() {
        let conn = setup_db();

        seed_default_tags(&conn).unwrap();
        let tags = list_tags(&conn).unwrap();
        assert_eq!(tags.len(), 6);

        // Idempotent
        seed_default_tags(&conn).unwrap();
        let tags = list_tags(&conn).unwrap();
        assert_eq!(tags.len(), 6);
    }

    #[test]
    fn test_cascade_delete_tag_removes_junction() {
        let conn = setup_db();
        insert_test_transaction(&conn, "txn-1");

        let t1 = create_tag(&conn, "Work", "work").unwrap();
        add_tags_to_transaction(&conn, "txn-1", &[t1.id.clone()]).unwrap();

        delete_tag(&conn, &t1.id).unwrap();

        let tags = get_transaction_tags(&conn, "txn-1").unwrap();
        assert!(tags.is_empty());
    }
}
