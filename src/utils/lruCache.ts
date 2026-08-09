// Map/Set con límite de tamaño y expulsión LRU (el más viejo se descarta al superar el máximo)

export class LruMap<K, V> extends Map<K, V> {
	constructor(private readonly maxSize: number) {
		super();
	}

	set(key: K, value: V): this {
		if (this.has(key)) {
			this.delete(key);
		} else if (this.size >= this.maxSize) {
			const oldestKey = this.keys().next().value as K;
			this.delete(oldestKey);
		}
		return super.set(key, value);
	}
}

export class LruSet<T> extends Set<T> {
	constructor(private readonly maxSize: number) {
		super();
	}

	add(value: T): this {
		if (this.has(value)) {
			this.delete(value);
		} else if (this.size >= this.maxSize) {
			const oldestValue = this.values().next().value as T;
			this.delete(oldestValue);
		}
		return super.add(value);
	}
}
