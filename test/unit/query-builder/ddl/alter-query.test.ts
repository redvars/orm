import { assertEquals, describe, it } from "../../../../test_deps.ts";
import AlterQuery from "../../../../src/core/query-builder/DDL/AlterQuery.ts";

describe({
  name: "AlterQuery",
  fn: () => {
    it("builds an ALTER TABLE ADD COLUMN statement", () => {
      const query = new AlterQuery("widget");
      query.addColumn({
        table: "widget",
        name: "color",
        native_type: "VARCHAR",
        not_null: false,
        unique: false,
      });
      assertEquals(
        query.buildQuery(),
        `ALTER TABLE public.widget \n\tADD COLUMN "color" VARCHAR`,
      );
    });

    it("adds multiple columns joined by a comma", () => {
      const query = new AlterQuery("widget");
      query.addColumn({
        table: "widget",
        name: "color",
        native_type: "VARCHAR",
        not_null: false,
        unique: false,
      });
      query.addColumn({
        table: "widget",
        name: "weight",
        native_type: "INTEGER",
        not_null: true,
        unique: false,
      });
      assertEquals(
        query.buildQuery(),
        `ALTER TABLE public.widget \n\tADD COLUMN "color" VARCHAR, ADD COLUMN "weight" INTEGER NOT NULL`,
      );
    });

    it("#addUnique - adds an explicit ADD UNIQUE constraint", () => {
      const query = new AlterQuery("student");
      query.addUnique(["name", "age"]);
      assertEquals(
        query.buildQuery(),
        `ALTER TABLE public.student \n\tADD UNIQUE ("name", "age")`,
      );
    });

    it("folds per-column unique:true into an auto ADD UNIQUE, excluding id", () => {
      const query = new AlterQuery("student");
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
        `ALTER TABLE public.student \n\tADD COLUMN "id" UUID NOT NULL, ADD COLUMN "roll_no" INTEGER, ADD UNIQUE ("roll_no")`,
      );
    });

    it("emits a REFERENCES clause for a foreign key column", () => {
      const query = new AlterQuery("employee");
      query.addColumn({
        table: "employee",
        name: "department",
        native_type: "UUID",
        not_null: false,
        unique: false,
        foreign_key: { table: "department", column: "id" },
      });
      const sql = query.buildQuery();
      assertEquals(
        sql.includes(
          `ADD COLUMN "department" UUID REFERENCES public.department ("id")`,
        ),
        true,
      );
    });
  },
});
