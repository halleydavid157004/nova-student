const res = await fetch('http://localhost:4310/api/ai/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'Hola, soy estudiante de ingeniería. Que ofertas de AI me recomiendas?' }),
});
const data = await res.json();
console.log(JSON.stringify(data, null, 2));
