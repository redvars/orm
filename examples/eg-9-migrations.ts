import getORM from "./getORM.ts";

const odm = getORM();
const client = await odm.connect(true);

await client.defineTable({
  name: "note",
  columns: [
    {
      name: "title",
      type: "string",
    },
    {
      name: "scratch",
      type: "string",
    },
  ],
});

const noteTable = client.table("note");
const note = noteTable.createNewRecord();
note.set("title", "First note");
note.set("scratch", "temporary content");
await note.insert();

// Redefine: rename "title" to "heading" and (opt-in) drop the now-unwanted
// "scratch" column.
client.deregisterTable("note");
await client.defineTable({
  name: "note",
  columns: [
    {
      name: "heading",
      type: "string",
    },
  ],
  renames: { title: "heading" },
  allowDestructiveMigrations: true,
});

const migrated = await client.table("note").getRecord({
  heading: "First note",
});
console.log("Value survived the rename:", migrated?.get("heading"));

const history = await client.query().execute(
  `SELECT change_type, detail FROM public._orm_migrations WHERE table_name = 'note' ORDER BY applied_at;`,
);
console.log("Migration history for 'note':");
console.log(history);

client.closeConnection();
