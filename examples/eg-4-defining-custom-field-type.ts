import {
  IDataType,
  type TColumnDataType,
  type TColumnDefinition,
} from "../mod.ts";
import getORM from "./getORM.ts";

const odm = getORM();
const client = await odm.connect(true);

class EmailType extends IDataType {
  constructor() {
    super("email");
  }

  getNativeType(_definition: TColumnDefinition): TColumnDataType {
    return "VARCHAR";
  }

  validateDefinition(_columnDefinition: TColumnDefinition) {
    // Throw an error if something in definition is not meeting your expectation.
  }

  // Coerces a value passed to Record#set() (or a raw pg-driver value when
  // hydrating a Record from a query result row) into this type's JSON-safe
  // representation - what Record#get() returns.
  setValueIntercept(newValue: any): any {
    return newValue;
  }

  // Converts the stored JSON-safe value back into this type's canonical
  // representation - what Record#getObject() returns.
  getObjectIntercept(value: string | null): string | null {
    return value;
  }

  async validateValue(value: unknown): Promise<void> {
    const pattern = "(.+)@(.+){2,}\\.(.+){2,}";
    if (
      value &&
      typeof value === "string" &&
      !new RegExp(pattern).test(value)
    ) {
      throw new Error("Not a valid email");
    }
  }
}

odm.addDataType(new EmailType());

await client.defineTable({
  name: "employee",
  columns: [
    {
      name: "name",
      type: "string",
    },
    {
      name: "personal_contact",
      type: "email",
    },
    {
      name: "emp_no",
      type: "uuid",
    },
    {
      name: "salary",
      type: "integer",
    },
    {
      name: "birth_date",
      type: "date",
    },
    {
      name: "gender",
      type: "boolean",
    },
  ],
});

const studentTable = client.table("employee");
const student = studentTable.createNewRecord();
student.set("personal_contact", "NOT_EMAIL_VALUE");
student.set("birth_date", new Date());
try {
  await student.insert(); // this will throw an error, because email is not valid
  console.log("Student created");
} catch (error) {
  console.log(error);
}

client.closeConnection();
