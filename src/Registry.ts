/**
 * Registry class is a generic class that provides a registry functionality for any type of object.
 * It uses a Map to store the objects, where the key is a string and the value is of type T.
 * The key for each object is determined by a function passed to the constructor.
 *
 * @template T The type of the objects that will be stored in the registry.
 */
export default class Registry<T> {
  /**
   * The Map object that stores the registry items.
   */
  private registry: Map<string, T> = new Map<string, T>();

  /**
   * A function that takes an item of type T and returns a string that will be used as the key in the registry.
   */
  readonly #getKey: (item: T) => string;

  /**
   * Creates a new Registry.
   *
   * @param getKey A function that takes an item of type T and returns a string that will be used as the key in the registry.
   */
  constructor(getKey: (item: T) => string) {
    this.#getKey = getKey;
  }

  /**
   * Checks if an item with the given name exists in the registry.
   *
   * @param name The name of the item to check.
   * @returns true if an item with the given name exists in the registry, false otherwise.
   */
  has(name: string): boolean {
    return this.registry.has(name);
  }

  hasEntries(): boolean {
    return this.registry.size > 0;
  }

  /**
   * Retrieves the item with the given name from the registry.
   *
   * @param name The name of the item to retrieve.
   * @returns The item with the given name, or undefined if no such item exists.
   */
  get(name: string): T | undefined {
    return this.registry.get(name);
  }

  /**
   * Returns all items currently stored in the registry.
   *
   * @returns {T[]} The items in the registry.
   */
  values(): T[] {
    return Array.from(this.registry.values());
  }

  /**
   * Adds an item to the registry.
   * The key for the item is determined by the getKey function passed to the constructor.
   *
   * @param item The item to add to the registry.
   * @throws {Error} If the item is not an object or if it is null.
   */
  add(item: T): void {
    if (typeof item !== "object") {
      throw new Error("Registry item must be an object");
    }
    if (!item) {
      throw new Error("Registry item must not be null");
    }

    this.registry.set(this.#getKey(item), item);
  }

  /**
   * Deletes an item with the given name from the registry.
   *
   * @param name The name of the item to delete.
   * @returns true if an item with the given name was found and deleted, false otherwise.
   */
  delete(name: string): boolean {
    return this.registry.delete(name);
  }
}
