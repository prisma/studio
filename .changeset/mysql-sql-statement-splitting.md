---
"@prisma/studio-core": patch
---

Fix running the SQL statement at the cursor on MySQL when the script contains backslash-escaped quotes (`'O\'Brien'`), backtick-quoted identifiers, or `#` comments. Studio now splits MySQL scripts with MySQL quoting and comment rules instead of sending several statements, or the wrong statement, to the database.
