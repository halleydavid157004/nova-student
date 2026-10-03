// Edit groups together: aliases describe topics, never eligibility or approval.
// The first alias names the topic (used by gapTopics). Brand names stay out of topic groups so a
// search for one brand never pulls in its whole category.
export const SYNONYMS=[
 ['cloud','nube','servidores','servidor','hosting','alojamiento'],
 ['ai','ia','inteligencia artificial','artificial intelligence','chatbot','gpt','llm'],
 ['design','diseno','grafico','ui','ux','iconos','prototipos'],
 ['development','desarrollo','programacion','programar','coding','codigo','developer','dev','ide','api'],
 ['productivity','productividad','organizacion','notas','notes','tareas','calendario'],
 ['education','educacion','aprendizaje','aprender','learning','cursos','courses','idiomas'],
 ['security','seguridad','vpn','privacidad','contrasenas','passwords','antivirus','ciberseguridad'],
 ['creative','creativo','creatividad','video','edicion','fotografia','foto','audio','3d','animacion'],
 ['streaming','musica','music','peliculas','series','tv','podcasts'],
 ['shopping','compras','tienda','tiendas','ropa','moda','retail','comida','restaurantes','zapatos'],
 ['travel','viajes','viajar','vuelos','aerolinea','aerolineas','transporte','tren','trenes','bus','buses'],
 ['health','salud','bienestar','gimnasio','gym','fitness','meditacion','sueno','medicina'],
 ['finance','finanzas','banco','bancos','seguros','seguro','insurance','dinero'],
 ['gaming','juegos','videojuegos','games','gamer'],
 ['hardware','equipos','computador','computadores','portatil','laptop','tecnologia','accesorios'],
 ['domains','dominio','dominios','sitio web','pagina web'],
 ['storage','almacenamiento'],
 ['email','correo'],
 ['free','gratis','gratuito','gratuita'],
 ['discount','descuento','descuentos','rebaja'],
 ['credits','creditos','credito'],
];
// Topics that also name catalog categories or offer types, so "viajes" finds every Travel offer
// even when its text never says "viajes".
export const TOPIC_CATEGORIES={cloud:['Cloud','Hosting'],ai:['AI'],design:['Design'],development:['Development'],productivity:['Productivity'],education:['Education'],security:['Security'],creative:['Creative'],streaming:['Streaming'],shopping:['Shopping'],travel:['Travel'],health:['Health'],finance:['Finance'],gaming:['Gaming'],hardware:['Hardware'],domains:['Hosting']};
export const TOPIC_TYPES={free:['free'],discount:['discount'],credits:['credits']};
