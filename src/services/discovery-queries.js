import {countryOptions} from '../../public/search/countries.js';
// Interleave geography and topics so neither waits behind an entire queue.
export function discoveryQueries(topics){
 const names=countryOptions('en').map(c=>c.name);
 const regional=names.map(name=>`student education discount free software official ${name}`);
 const latam=['Colombia','México','Argentina','Chile','Perú','Ecuador','Uruguay','Costa Rica','Panamá','Bolivia','Paraguay','República Dominicana','Guatemala','El Salvador','Honduras','Nicaragua','Venezuela','Brasil','Puerto Rico'];
 const priority=latam.map(name=>`beneficios descuentos estudiantes software universidad oficial ${name}`);
 const result=[];for(let i=0;i<Math.max(regional.length,topics.length,priority.length);i++){
 if(i<priority.length)result.push(priority[i]);if(i<topics.length)result.push(topics[i]);if(i<regional.length)result.push(regional[i]);
 }return [...new Set(result)];
}
