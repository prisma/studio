import { describe, expect, it } from "vitest";

import { classifySqlStatement } from "./sql-statement-risk";

describe("classifySqlStatement", () => {
  it.each([
    "select * from users",
    "SELECT 1",
    "Select id From users Where id = 1",
    "explain select * from users",
    "EXPLAIN (FORMAT JSON) DELETE FROM users",
    "show search_path",
    "describe users",
    "desc users",
    "values (1), (2)",
    "table users",
    "pragma table_info(users)",
    "with recent as (select * from orders) select * from recent",
    "select * from orders for update",
    "select 'DELETE FROM users' as text",
    "select 1 -- DELETE FROM users",
    "select /* drop table users */ 1",
  ])("treats %j as safe", (sql) => {
    expect(classifySqlStatement(sql).kind).toBe("safe");
  });

  it.each([
    ["delete from orders", "DELETE", "orders"],
    ["DELETE FROM orders", "DELETE", "orders"],
    ["Delete From public.orders", "DELETE", "public.orders"],
    ['delete from "Order Items"', "DELETE", "Order Items"],
    ['delete from public."Orders"', "DELETE", "public.Orders"],
    ["delete from `orders`", "DELETE", "orders"],
    ["delete from only orders", "DELETE", "orders"],
    ["update orders set status = 'done'", "UPDATE", "orders"],
    ["UPDATE public.orders SET a = 1", "UPDATE", "public.orders"],
  ])("treats %j without WHERE as danger", (sql, statementType, target) => {
    expect(classifySqlStatement(sql)).toEqual({
      kind: "danger",
      reason: "no-where",
      statementType,
      target,
    });
  });

  it.each([
    ["delete from orders where id = 1", "DELETE", "orders"],
    ["DELETE FROM orders WHERE id IN (select id from old)", "DELETE", "orders"],
    ["update orders set a = 1 where id = 1", "UPDATE", "orders"],
    ["insert into orders (id) values (1)", "INSERT", "orders"],
    ["alter table orders add column note text", "ALTER", "orders"],
    ["create table t (id int)", "CREATE", null],
    ["grant select on orders to reader", "GRANT", null],
  ])("treats %j as write", (sql, statementType, target) => {
    expect(classifySqlStatement(sql)).toEqual({
      kind: "write",
      statementType,
      target,
    });
  });

  it("does not count WHERE inside a string, comment or subquery", () => {
    expect(
      classifySqlStatement("delete from orders -- where id = 1").kind,
    ).toBe("danger");
    expect(
      classifySqlStatement("delete from orders /* where id = 1 */").kind,
    ).toBe("danger");
    expect(
      classifySqlStatement("update orders set note = 'where id = 1'").kind,
    ).toBe("danger");
    expect(
      classifySqlStatement(
        "update orders set total = (select sum(x) from items where items.o = 1)",
      ).kind,
    ).toBe("danger");
  });

  it("is not fooled by leading comments", () => {
    expect(classifySqlStatement("-- note\nDELETE FROM t")).toMatchObject({
      kind: "danger",
      statementType: "DELETE",
      target: "t",
    });
    expect(classifySqlStatement("/* x */ drop table t")).toMatchObject({
      kind: "danger",
      statementType: "DROP TABLE",
      target: "t",
    });
    expect(
      classifySqlStatement("/* a /* nested */ b */\n  -- c\n truncate t").kind,
    ).toBe("danger");
  });

  it.each([
    ["drop table orders", "DROP TABLE", "orders"],
    ["DROP TABLE IF EXISTS public.orders", "DROP TABLE", "public.orders"],
    ["drop view recent_orders", "DROP VIEW", "recent_orders"],
    ["drop materialized view mv", "DROP MATERIALIZED VIEW", "mv"],
    ["drop schema app cascade", "DROP SCHEMA", "app"],
    ["truncate orders", "TRUNCATE", "orders"],
    ["TRUNCATE TABLE orders", "TRUNCATE", "orders"],
    ["truncate table only public.orders", "TRUNCATE", "public.orders"],
    ["alter table orders drop column note", "ALTER", "orders"],
  ])("treats %j as danger", (sql, statementType, target) => {
    expect(classifySqlStatement(sql)).toEqual({
      kind: "danger",
      statementType,
      target,
    });
  });

  it("classifies the statement EXPLAIN ANALYZE would actually run", () => {
    expect(classifySqlStatement("explain analyze delete from t")).toEqual({
      kind: "danger",
      reason: "no-where",
      statementType: "DELETE",
      target: "t",
    });
    expect(
      classifySqlStatement("EXPLAIN (ANALYZE, BUFFERS) update t set a = 1")
        .kind,
    ).toBe("danger");
    expect(classifySqlStatement("explain analyze select 1").kind).toBe("safe");
  });

  it("treats SELECT INTO and assigning PRAGMAs as writes", () => {
    expect(classifySqlStatement("select * into backup from orders")).toEqual({
      kind: "write",
      statementType: "SELECT INTO",
      target: null,
    });
    expect(classifySqlStatement("pragma foreign_keys = off").kind).toBe(
      "write",
    );
  });

  it("classifies the main statement of a WITH query", () => {
    expect(
      classifySqlStatement(
        "with old as (select id from orders) delete from orders",
      ),
    ).toMatchObject({ kind: "danger", statementType: "DELETE" });
    expect(
      classifySqlStatement(
        "with old as (select id from orders) delete from orders where id in (select id from old)",
      ),
    ).toMatchObject({ kind: "write", statementType: "DELETE" });
    expect(
      classifySqlStatement(
        "with gone as (delete from orders returning *) select count(*) from gone",
      ),
    ).toEqual({ kind: "unknown", statementType: "WITH", target: null });
  });

  it("returns unknown for empty or unrecognised input", () => {
    expect(classifySqlStatement("").kind).toBe("unknown");
    expect(classifySqlStatement("   -- only a comment").kind).toBe("unknown");
    expect(classifySqlStatement("flibble wibble").kind).toBe("unknown");
    expect(classifySqlStatement("call cleanup()")).toEqual({
      kind: "unknown",
      statementType: "CALL",
      target: null,
    });
    expect(classifySqlStatement("(select 1)").kind).toBe("unknown");
  });

  it("uses the riskiest statement when given several", () => {
    expect(
      classifySqlStatement(
        "select 1; drop table orders; insert into t values (1)",
      ),
    ).toMatchObject({ kind: "danger", statementType: "DROP TABLE" });
    expect(classifySqlStatement("select 1; select 2").kind).toBe("safe");
  });
});
