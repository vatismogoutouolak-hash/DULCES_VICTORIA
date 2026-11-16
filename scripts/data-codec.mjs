// Lossless Firestore document values; deliberately excludes credentials/Auth hashes.
export function encode(value) {
  if(typeof value==='number'&&!Number.isFinite(value))return {$type:'number',value:String(value)};
  if (value === null || typeof value !== 'object') return value;
  if (typeof value.toMillis === 'function' && Number.isInteger(value.seconds)) return {$type:'timestamp',seconds:value.seconds,nanoseconds:value.nanoseconds};
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return {$type:'bytes',base64:Buffer.from(value).toString('base64')};
  if (value instanceof Date) return {$type:'date',value:value.toISOString()};
  if (typeof value.path === 'string' && typeof value.get === 'function') return {$type:'reference',path:value.path};
  if (typeof value.latitude === 'number' && typeof value.longitude === 'number') return {$type:'geopoint',latitude:value.latitude,longitude:value.longitude};
  if (Array.isArray(value)) return value.map(encode);
  if(Object.hasOwn(value,'$type'))return {$type:'map',entries:Object.fromEntries(Object.entries(value).map(([key,item])=>[key,encode(item)]))};
  return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,encode(item)]));
}
export function decode(value,{Timestamp,GeoPoint,db}) {
  if (value === null || typeof value !== 'object') return value;
  if (value.$type === 'timestamp') return new Timestamp(value.seconds,value.nanoseconds);
  if (value.$type === 'date') return new Date(value.value);
  if (value.$type === 'bytes') return Buffer.from(value.base64,'base64');
  if (value.$type === 'reference') return db.doc(value.path);
  if (value.$type === 'geopoint') return new GeoPoint(value.latitude,value.longitude);
  if (value.$type === 'number') return Number(value.value);
  if (value.$type === 'map') return Object.fromEntries(Object.entries(value.entries).map(([key,item])=>[key,decode(item,{Timestamp,GeoPoint,db})]));
  if (Array.isArray(value)) return value.map(item=>decode(item,{Timestamp,GeoPoint,db}));
  return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,decode(item,{Timestamp,GeoPoint,db})]));
}
