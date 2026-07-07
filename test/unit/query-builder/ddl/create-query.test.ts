import { assertEquals, describe, it } from "../../../../test_deps.ts";
import CreateQuery from "../../../../src/core/query-builder/DDL/CreateQuery.ts";

describe({
  name: "CreateQuery",
  fn: () => {
    it("builds a basic CREATE TABLE statement", () => {
      const query = new CreateQuery("widget");
      query.addColumn({
        table: "widget",
        name: "id",
        native_type: "UUID",
        not_null: true,
        unique: true,
      });
      query.addColumn({
        table: "widget",
        name: "name",
        native_type: "VARCHAR",
        not_null: false,
        unique: false,
      });
      // "id" is excluded from auto-unique folding - it already gets PRIMARY KEY.
      assertEquals(
        query.buildQuery(),
        `CREATE TABLE public.widget ("id" UUID NOT NULL, "name" VARCHAR, PRIMARY KEY (id))`,
      );
    });

    it("normalizes a schema-qualified table name", () => {
      const query = new CreateQuery("company.employee");
      query.addColumn({
        table: "company.employee",
        name: "id",
        native_type: "UUID",
        not_null: true,
        unique: false,
      });
      assertEquals(
        query.buildQuery(),
        `CREATE TABLE company.employee ("id" UUID NOT NULL, PRIMARY KEY (id))`,
      );
    });

    it("emits a REFERENCES clause for a foreign key column", () => {
      const query = new CreateQuery("employee");
      query.addColumn({
        table: "employee",
        name: "department",
        native_type: "UUID",
        not_null: false,
        unique: false,
        foreign_key: { table: "department", column: "id" },
      });
      const sql = query.buildQuery();
      assertEquals(sql.startsWith(`CREATE TABLE public.employee (`), true);
      assertEquals(
        sql.includes(`"department" UUID REFERENCES public.department ("id")`),
        true,
      );
      assertEquals(sql.includes("ON DELETE"), false);
      assertEquals(sql.endsWith(`PRIMARY KEY (id))`), true);
    });

    it("appends ON DELETE when the foreign key declares one", () => {
      const query = new CreateQuery("employee");
      query.addColumn({
        table: "employee",
        name: "department",
        native_type: "UUID",
        not_null: false,
        unique: false,
        foreign_key: {
          table: "department",
          column: "id",
          on_delete: "CASCADE",
        },
      });
      const sql = query.buildQuery();
      assertEquals(
        sql.includes(`REFERENCES public.department ("id")`) &&
          sql.includes("ON DELETE CASCADE"),
        true,
      );
    });

    it("#addUnique - adds an explicit multi-column unique constraint", () => {
      const query = new CreateQuery("student");
      query.addColumn({
        table: "student",
        name: "name",
        native_type: "VARCHAR",
        not_null: false,
        unique: false,
      });
      query.addUnique(["name", "age"]);
      assertEquals(
        query.buildQuery(),
        `CREATE TABLE public.student ("name" VARCHAR, UNIQUE ("name", "age"), PRIMARY KEY (id))`,
      );
    });

    it("folds per-column unique:true into an auto UNIQUE constraint, excluding id", () => {
      const query = new CreateQuery("student");
      query.addColumn({
        table: "student",
        name: "id",
        native_type: "UUID",
        not_null: true,
        unique: true,
      });
      query.addColumn({
        table: "student",
        name: "roll_no",
        native_type: "INTEGER",
        not_null: false,
        unique: true,
      });
      assertEquals(
        query.buildQuery(),
        `CREATE TABLE public.student ("id" UUID NOT NULL, "roll_no" INTEGER, UNIQUE ("roll_no"), PRIMARY KEY (id))`,
      );
    });
  },
});
