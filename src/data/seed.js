/* ═══════════════════════════════════════════════════════
   Nova Student Radar — Seed Data v3.0
   70+ verified student offers worldwide
   ═══════════════════════════════════════════════════════ */

/* ── Category map & icons (used by frontend) ── */
export const CATEGORIES = {
  'Development':   { emoji:'💻', color:'#6366f1', label:'Desarrollo' },
  'Cloud':         { emoji:'☁️', color:'#0ea5e9', label:'Cloud & Hosting' },
  'Design':        { emoji:'🎨', color:'#f43f5e', label:'Diseño' },
  'Creative':      { emoji:'✨', color:'#d946ef', label:'Creativo' },
  'Productivity':  { emoji:'⚡', color:'#f59e0b', label:'Productividad' },
  'AI':            { emoji:'🤖', color:'#8b5cf6', label:'Inteligencia Artificial' },
  'Entertainment': { emoji:'🎬', color:'#ef4444', label:'Entretenimiento' },
  'Education':     { emoji:'🎓', color:'#10b981', label:'Educación & Cursos' },
  'Finance':       { emoji:'💰', color:'#14b8a6', label:'Finanzas' },
  'Hardware':      { emoji:'🖥️', color:'#64748b', label:'Hardware & Equipos' },
  'Security':      { emoji:'🔒', color:'#dc2626', label:'Seguridad' },
  'Hosting':       { emoji:'🌐', color:'#0891b2', label:'Dominios & Hosting' },
  'Streaming':     { emoji:'📺', color:'#be185d', label:'Streaming' },
  'Shopping':      { emoji:'🛒', color:'#ea580c', label:'Compras & Retail' },
  'Travel':        { emoji:'✈️', color:'#0284c7', label:'Viajes & Transporte' },
  'Health':        { emoji:'🏥', color:'#16a34a', label:'Salud & Bienestar' },
  'Gaming':        { emoji:'🎮', color:'#7c3aed', label:'Gaming' },
};

export const OFFERS = [
  /* ══════════════ DEVELOPMENT ══════════════ */
  {
    slug:'github-student-developer-pack', brand:'GitHub', title:'GitHub Student Developer Pack',
    summary:'El paquete de herramientas para desarrolladores más grande del mundo: 100+ ofertas en un solo lugar.',
    benefit:'Acceso gratuito a GitHub Pro, Copilot, Codespaces, y 100+ herramientas de partners como Azure, DigitalOcean, Namecheap, JetBrains y más.',
    category:'Development', offer_type:'bundle', countries:['GLOBAL'],
    requirements:['Ser estudiante activamente matriculado','Tener 13+ años','Completar verificación GitHub Education'],
    steps:['Ve a education.github.com/pack','Inicia sesión con GitHub','Sube foto de tu credencial estudiantil o usa correo .edu','Espera aprobación (1-7 días)','Activa cada beneficio desde el Pack'],
    verification:'GitHub Education', source_url:'https://education.github.com/pack', official:true, confidence:99,
    requires_card:false, commercial_use:'depends-on-partner', tags:['trending','must-have']
  },
  {
    slug:'jetbrains-student-pack', brand:'JetBrains', title:'JetBrains All Products Pack — Student',
    summary:'Todos los IDEs profesionales de JetBrains 100% gratis para estudiantes.',
    benefit:'IntelliJ IDEA Ultimate, PyCharm Pro, WebStorm, GoLand, DataGrip, CLion, Rider, RubyMine, PhpStorm — gratis mientras seas estudiante.',
    category:'Development', offer_type:'free', countries:['GLOBAL'],
    requirements:['Ser estudiante o profesor activo','Verificar por correo .edu, ISIC, documento o GitHub Education'],
    steps:['Ve a jetbrains.com/community/education/#students','Elige Apply now','Verifica con correo educativo o GitHub Education','Activa los productos en tu cuenta JetBrains','Renueva cada año'],
    verification:'Education verification', source_url:'https://www.jetbrains.com/community/education/#students', official:true, confidence:99,
    requires_card:false, commercial_use:'no', tags:['must-have']
  },
  {
    slug:'github-copilot-free', brand:'GitHub', title:'GitHub Copilot — Gratis para Estudiantes',
    summary:'El asistente de código con IA #1 del mundo, completamente gratis con el Student Pack.',
    benefit:'GitHub Copilot Individual sin límites — autocompletado IA en VS Code, JetBrains y Neovim.',
    category:'AI', offer_type:'free', countries:['GLOBAL'],
    requirements:['GitHub Student Developer Pack activo'],
    steps:['Verifica tu cuenta en education.github.com','Ve a github.com/settings/copilot','Activa Copilot (gratis con Student Pack)','Instala la extensión en tu IDE'],
    verification:'GitHub Education', source_url:'https://github.com/features/copilot', official:true, confidence:99,
    requires_card:false, commercial_use:'no', tags:['trending','ai']
  },
  {
    slug:'replit-hacker', brand:'Replit', title:'Replit Hacker Plan Gratis',
    summary:'IDE cloud con IA integrada — programa desde cualquier navegador sin instalar nada.',
    benefit:'Plan Hacker (~$200/año gratis): 4× velocidad, Ghostwriter IA, almacenamiento extra, siempre activo.',
    category:'Development', offer_type:'free', countries:['GLOBAL'],
    requirements:['GitHub Student Developer Pack activo'],
    steps:['Activa tu GitHub Education Pack','Ve a replit.com/github-student','Conecta tu cuenta GitHub','Plan Hacker se activa automáticamente'],
    verification:'GitHub Education', source_url:'https://replit.com/github-student', official:true, confidence:95,
    requires_card:false, commercial_use:'check-terms', tags:['ai']
  },
  {
    slug:'gitkraken-pro', brand:'GitKraken', title:'GitKraken Pro Suite — Gratis',
    summary:'Cliente Git visual + GitLens Pro + Boards — 3 productos premium gratis.',
    benefit:'GitKraken Desktop Pro, GitLens Pro para VS Code, y GitKraken Boards Pro — todo gratis.',
    category:'Development', offer_type:'free', countries:['GLOBAL'],
    requirements:['GitHub Student Developer Pack activo'],
    steps:['Activa GitHub Education Pack','Ve a gitkraken.com/github-student-developer-pack','Conecta con GitHub','Todos los productos Pro se desbloquean'],
    verification:'GitHub Education', source_url:'https://www.gitkraken.com/github-student-developer-pack', official:true, confidence:94,
    requires_card:false, commercial_use:'no'
  },
  {
    slug:'mongodb-students', brand:'MongoDB', title:'MongoDB for Students',
    summary:'Créditos Atlas y todos los cursos de MongoDB University completamente gratis.',
    benefit:'$50 USD en créditos MongoDB Atlas + certificaciones y cursos gratis en MongoDB University.',
    category:'Development', offer_type:'credits', countries:['GLOBAL'],
    requirements:['Correo educativo o GitHub Education Pack'],
    steps:['Regístrate en mongodb.com/students','Verifica con correo .edu o GitHub','Los créditos se aplican automáticamente a tu cuenta Atlas'],
    verification:'GitHub Education / Educational email', source_url:'https://www.mongodb.com/students', official:true, confidence:96,
    requires_card:false, commercial_use:'check-terms'
  },

  /* ══════════════ CLOUD & HOSTING ══════════════ */
  {
    slug:'azure-for-students', brand:'Microsoft Azure', title:'Azure for Students — $100 Gratis',
    summary:'Cuenta Azure sin tarjeta de crédito con créditos y 25+ servicios gratis.',
    benefit:'$100 USD en créditos Azure + 25+ servicios gratuitos siempre (VMs, bases de datos, IA). Renovable cada año.',
    category:'Cloud', offer_type:'credits', countries:['GLOBAL'],
    requirements:['Correo institucional educativo','Ser estudiante elegible'],
    steps:['Ve a azure.microsoft.com/free/students','Haz clic en "Start free"','Verifica con tu correo .edu','Completa el registro — NO pide tarjeta de crédito','Empieza a usar Azure inmediatamente'],
    verification:'Educational email', source_url:'https://azure.microsoft.com/en-us/free/students', official:true, confidence:99,
    requires_card:false, commercial_use:'check-terms', tags:['must-have']
  },
  {
    slug:'aws-educate', brand:'Amazon Web Services', title:'AWS Educate — Créditos + Labs',
    summary:'Aprende cloud computing con créditos reales y laboratorios prácticos de AWS.',
    benefit:'Créditos AWS + laboratorios prácticos hands-on + rutas de aprendizaje en cloud, IA y ML.',
    category:'Cloud', offer_type:'credits', countries:['GLOBAL'],
    requirements:['Ser estudiante (no siempre requiere correo .edu)','18+ años en algunos países'],
    steps:['Ve a aws.amazon.com/education/awseducate','Crea cuenta Educate','Selecciona tu rol de estudiante','Completa verificación y accede a labs + créditos'],
    verification:'Education verification', source_url:'https://aws.amazon.com/education/awseducate/', official:true, confidence:98,
    requires_card:false, commercial_use:'check-terms'
  },
  {
    slug:'google-cloud-students', brand:'Google Cloud', title:'Google Cloud — $300 en Créditos',
    summary:'Explora IA, datos, Kubernetes y toda la infraestructura de Google Cloud gratis.',
    benefit:'$300 USD en créditos gratis por 90 días + always-free tier con Compute Engine, Cloud Run, BigQuery y más.',
    category:'Cloud', offer_type:'credits', countries:['GLOBAL'],
    requirements:['Cuenta Google nueva en Google Cloud','Correo educativo puede desbloquear beneficios extra'],
    steps:['Ve a cloud.google.com/free','Regístrate con cuenta Google','Activa trial de $300','Explora también edu.google.com para beneficios educativos'],
    verification:'Educational email', source_url:'https://cloud.google.com/edu', official:true, confidence:96,
    requires_card:true, commercial_use:'check-terms'
  },
  {
    slug:'digitalocean-student', brand:'DigitalOcean', title:'DigitalOcean — $200 en Créditos',
    summary:'Hospeda apps, APIs y proyectos en la nube con $200 de crédito gratis.',
    benefit:'$200 USD en créditos DigitalOcean válidos por 12 meses vía GitHub Student Pack.',
    category:'Cloud', offer_type:'credits', countries:['GLOBAL'],
    requirements:['GitHub Student Developer Pack activo'],
    steps:['Activa tu GitHub Education Pack','Ve a digitalocean.com y crea cuenta','Conecta con GitHub para verificar','$200 en créditos se aplican automáticamente'],
    verification:'GitHub Education', source_url:'https://www.digitalocean.com', official:true, confidence:95,
    requires_card:false, commercial_use:'check-terms'
  },
  {
    slug:'namecheap-student', brand:'Namecheap', title:'Namecheap — Dominio .me + SSL Gratis',
    summary:'Tu primer dominio web y certificado SSL completamente gratis por 1 año.',
    benefit:'Dominio .me gratis por 1 año + certificado SSL Positive Comodo gratis via GitHub Student Pack.',
    category:'Hosting', offer_type:'free', countries:['GLOBAL'],
    requirements:['GitHub Student Developer Pack activo'],
    steps:['Activa GitHub Education Pack','Ve a namecheap.com/github-students','Conecta con GitHub','Registra tu dominio .me gratuito','SSL se aplica automáticamente'],
    verification:'GitHub Education', source_url:'https://www.namecheap.com', official:true, confidence:93,
    requires_card:false, commercial_use:'check-terms'
  },
  {
    slug:'heroku-student', brand:'Heroku', title:'Heroku — Créditos Platform via Student Pack',
    summary:'Despliega apps web con un solo comando en la plataforma cloud de Salesforce.',
    benefit:'$13/mes en créditos Heroku por 12 meses (equivalente a 1 dyno Eco + Postgres Mini) vía GitHub Student Pack.',
    category:'Cloud', offer_type:'credits', countries:['GLOBAL'],
    requirements:['GitHub Student Developer Pack activo'],
    steps:['Activa GitHub Education Pack','Crea cuenta en Heroku','Conecta con GitHub Education','Créditos mensuales se aplican automáticamente'],
    verification:'GitHub Education', source_url:'https://www.heroku.com/github-students', official:true, confidence:90,
    requires_card:false, commercial_use:'check-terms'
  },

  /* ══════════════ DESIGN ══════════════ */
  {
    slug:'figma-education', brand:'Figma', title:'Figma Professional — Gratis para Estudiantes',
    summary:'La herramienta de diseño colaborativo #1 del mundo, plan Pro gratis.',
    benefit:'Figma Professional gratis: proyectos ilimitados, historial de versiones ilimitado, audio, prototipado avanzado.',
    category:'Design', offer_type:'free', countries:['GLOBAL'],
    requirements:['Ser estudiante/educador de institución acreditada','Correo institucional'],
    steps:['Ve a figma.com/education','Haz clic en "Get verified"','Completa formulario con correo .edu','Verificación en 1-3 días','Plan Pro se activa automáticamente'],
    verification:'Educational email', source_url:'https://www.figma.com/education/', official:true, confidence:99,
    requires_card:false, commercial_use:'no', tags:['must-have']
  },
  {
    slug:'canva-education', brand:'Canva', title:'Canva Pro — Gratis para Estudiantes',
    summary:'Diseño gráfico profesional con plantillas premium, IA y 100M+ elementos gratis.',
    benefit:'Canva Pro gratis: quitar fondos con IA, Brand Kit, programación de posts, 100M+ fotos/vídeos premium.',
    category:'Design', offer_type:'free', countries:['REGIONAL'],
    requirements:['Correo educativo o registro vía institución'],
    steps:['Ve a canva.com/education','Selecciona "Soy estudiante"','Regístrate con correo .edu','Verifica y accede a Canva Pro gratis'],
    verification:'Educational email', source_url:'https://www.canva.com/education/', official:true, confidence:97,
    requires_card:false, commercial_use:'no', tags:['must-have']
  },
  {
    slug:'autodesk-education', brand:'Autodesk', title:'Autodesk Education — Suite Completa Gratis',
    summary:'AutoCAD, Fusion 360, Maya, 3ds Max, Revit y 100+ productos gratis por 1 año.',
    benefit:'Acceso gratuito a toda la suite Autodesk: AutoCAD, Fusion 360, Maya, 3ds Max, Revit y más. Renovable cada año.',
    category:'Design', offer_type:'free', countries:['GLOBAL'],
    requirements:['Estudiante o docente de institución reconocida','Uso exclusivamente educativo'],
    steps:['Crea cuenta en Autodesk','Ve a autodesk.com/education/edu-software','Confirma institución y rol','Completa verificación educativa','Descarga los productos que necesites'],
    verification:'Education verification', source_url:'https://www.autodesk.com/education/edu-software/overview', official:true, confidence:98,
    requires_card:false, commercial_use:'no'
  },
  {
    slug:'adobe-creative-cloud-student', brand:'Adobe', title:'Adobe Creative Cloud — 65% de Descuento',
    summary:'Photoshop, Illustrator, Premiere Pro, After Effects y toda la suite Creative Cloud.',
    benefit:'Creative Cloud All Apps con hasta 65% de descuento ($19.99/mes en EE.UU.) — incluye 20+ apps profesionales.',
    category:'Creative', offer_type:'discount', countries:['REGIONAL'],
    requirements:['Ser estudiante/docente elegible','Verificación vía SheerID o documentos'],
    steps:['Ve a adobe.com/creativecloud/buy/students.html','Elige plan de estudiante','Crea o inicia sesión en Adobe','Completa verificación educativa (SheerID)','Revisa precio local antes de activar — requiere pago'],
    verification:'SheerID / documents', source_url:'https://www.adobe.com/creativecloud/buy/students.html', official:true, confidence:97,
    requires_card:true, commercial_use:'check-plan-terms'
  },

  /* ══════════════ AI & ML ══════════════ */
  {
    slug:'chatgpt-plus-student', brand:'OpenAI', title:'ChatGPT Plus — 4 meses gratis para estudiantes elegibles',
    summary:'Promoción de regreso a clases de 2026 para estudiantes universitarios elegibles en EE.UU.; solicítala hasta el 31 de octubre.',
    benefit:'Cuatro mensualidades gratis de ChatGPT Plus. Después se renueva a $20/mes salvo cancelación; se requiere un método de pago válido.',
    category:'AI', offer_type:'free', countries:['US'], expires_at:'2026-11-01T07:00:00.000Z',
    requirements:['Estudiar en una institución universitaria elegible de EE.UU.','Verificar la matrícula actual mediante SheerID','Tener un método de pago válido para activar la promoción'],
    steps:['Abre la página de la promoción antes del 31 de octubre de 2026','Inicia sesión en la cuenta de ChatGPT donde deseas aplicar la oferta','Sigue la verificación de matrícula de SheerID','Vuelve al flujo de la promoción y completa la activación'],
    verification:'SheerID', source_url:'https://chatgpt.com/students/2026/', official:true, confidence:99,
    requires_card:true, commercial_use:'personal', tags:['trending','ai','hot']
  },

  /* ══════════════ PRODUCTIVITY ══════════════ */
  {
    slug:'microsoft-365-education', brand:'Microsoft', title:'Microsoft 365 Education A1 — Gratis',
    summary:'Office 365 completo gratis: Word, Excel, PowerPoint, Teams, OneNote + 1 TB OneDrive.',
    benefit:'Word, Excel, PowerPoint, OneNote, Outlook, Teams — versiones web + 1 TB en OneDrive. 100% gratis con correo .edu.',
    category:'Productivity', offer_type:'free', countries:['GLOBAL'],
    requirements:['Correo institucional (.edu o equivalente)','Institución reconocida por Microsoft'],
    steps:['Ve a microsoft.com/education/students','Ingresa tu correo .edu','Verifica elegibilidad automáticamente','Crea o conecta tu cuenta Microsoft','Descarga apps de escritorio o usa online'],
    verification:'Educational email', source_url:'https://www.microsoft.com/education/students', official:true, confidence:98,
    requires_card:false, commercial_use:'no', tags:['must-have']
  },
  {
    slug:'google-workspace-education', brand:'Google', title:'Google Workspace for Education',
    summary:'Gmail, Drive, Docs, Meet, Classroom — todo gratis con tu correo institucional.',
    benefit:'Google Drive ilimitado (o 100 TB pool), Gmail educativo, Google Meet sin límites, Classroom y más.',
    category:'Productivity', offer_type:'free', countries:['GLOBAL'],
    requirements:['La institución educativa debe activar Google Workspace','Correo institucional'],
    steps:['Pregunta a tu universidad si usan Google Workspace','Si sí, inicia sesión con tu correo institucional en google.com','Accede a Drive, Docs, Meet, Classroom y más','¿No lo tienen? Sugiérelo a IT de tu universidad'],
    verification:'Institutional', source_url:'https://workspace.google.com/products/education/', official:true, confidence:97,
    requires_card:false, commercial_use:'no'
  },
  {
    slug:'grammarly-student', brand:'Grammarly', title:'Grammarly Premium — Descuento Student',
    summary:'Corrector gramatical con IA para ensayos, tesis y trabajos académicos.',
    benefit:'Grammarly Premium con descuento de hasta 25% para estudiantes. Corrección avanzada, tono, plagio, IA.',
    category:'Productivity', offer_type:'discount', countries:['GLOBAL'],
    requirements:['Correo educativo para acceder al descuento'],
    steps:['Ve a grammarly.com/edu','Regístrate con correo .edu','Aplica descuento al plan Premium o Business'],
    verification:'Educational email', source_url:'https://www.grammarly.com/edu', official:true, confidence:90,
    requires_card:true, commercial_use:'personal'
  },

  /* ══════════════ ENTERTAINMENT & STREAMING ══════════════ */
  {
    slug:'amazon-prime-student', brand:'Amazon', title:'Amazon Prime Student — 6 Meses Gratis',
    summary:'Prime completo gratis por 6 meses y luego a mitad de precio — incluye envío, Video, Music y más.',
    benefit:'6 meses gratis de Amazon Prime + después 50% de descuento ($7.49/mes en EE.UU.). Incluye Prime Video, Music, Gaming, envío gratis.',
    category:'Streaming', offer_type:'free', countries:['US','GB','DE','FR','ES','IT','JP','CA'],
    requirements:['Ser estudiante universitario con correo .edu','Estar matriculado en institución de educación superior elegible'],
    steps:['Ve a amazon.com/primestudent (o la versión de tu país)','Inicia sesión o crea cuenta Amazon','Verifica con correo .edu','Activa tu trial de 6 meses gratis','Después del trial, Prime al 50% del precio'],
    verification:'Educational email / SheerID', source_url:'https://www.amazon.com/primestudent', official:true, confidence:99,
    requires_card:true, commercial_use:'personal', tags:['trending','hot','must-have']
  },
  {
    slug:'spotify-premium-student', brand:'Spotify', title:'Spotify Premium Student — 50% Off',
    summary:'Música y podcasts sin anuncios a mitad de precio, con Hulu y SHOWTIME en EE.UU.',
    benefit:'Spotify Premium a ~$5.99/mes (50% descuento). En EE.UU. incluye Hulu (con anuncios) y SHOWTIME.',
    category:'Streaming', offer_type:'discount', countries:['REGIONAL'],
    requirements:['Estudiante de institución superior elegible','País con Premium Student disponible','Re-verificar cada 12 meses vía SheerID'],
    steps:['Ve a spotify.com/student','Selecciona oferta Student','Inicia sesión o crea cuenta','Verifica con SheerID usando correo .edu','Premium se activa inmediatamente'],
    verification:'SheerID', source_url:'https://www.spotify.com/student/', official:true, confidence:96,
    requires_card:true, commercial_use:'personal', tags:['trending']
  },
  {
    slug:'apple-music-student', brand:'Apple', title:'Apple Music Student + Apple TV+',
    summary:'Apple Music al 50% del precio + Apple TV+ gratis incluido.',
    benefit:'Apple Music a $5.99/mes (50% descuento) + Apple TV+ gratis mientras seas estudiante. Hasta 4 años.',
    category:'Streaming', offer_type:'discount', countries:['REGIONAL'],
    requirements:['Estudiante universitario en país elegible','Verificación vía UNiDAYS'],
    steps:['Abre la app Music o ve a music.apple.com','Elige plan Student','Verifica con UNiDAYS','Confirma suscripción — Apple TV+ se incluye gratis'],
    verification:'UNiDAYS', source_url:'https://www.apple.com/apple-music/', official:true, confidence:95,
    requires_card:true, commercial_use:'personal'
  },
  {
    slug:'youtube-premium-student', brand:'YouTube', title:'YouTube Premium Student — 50% Off',
    summary:'YouTube sin anuncios + YouTube Music, a mitad de precio.',
    benefit:'YouTube Premium a ~$7.99/mes (50% descuento). Sin anuncios, reproducción en segundo plano, descargas, YouTube Music incluido.',
    category:'Streaming', offer_type:'discount', countries:['REGIONAL'],
    requirements:['Estudiante de educación superior en país elegible','Verificación SheerID'],
    steps:['Ve a youtube.com/premium/student','Haz clic en "Student plan"','Verifica con SheerID','Activa plan — re-verifica cada año'],
    verification:'SheerID', source_url:'https://www.youtube.com/premium/student', official:true, confidence:93,
    requires_card:true, commercial_use:'personal'
  },

  /* ══════════════ EDUCATION & COURSES ══════════════ */
  {
    slug:'coursera-student', brand:'Coursera', title:'Coursera — Cursos Gratis para Estudiantes',
    summary:'Miles de cursos de universidades top como Stanford, MIT, Google y más — gratis con ayuda financiera.',
    benefit:'Auditar cursos gratis + ayuda financiera disponible para certificados. Cursos de IA, data science, programación.',
    category:'Education', offer_type:'free', countries:['GLOBAL'],
    requirements:['Crear cuenta Coursera','Aplicar a ayuda financiera si quieres certificado gratis'],
    steps:['Ve a coursera.org','Crea cuenta gratis','Busca el curso que quieras','Haz clic en "Enroll for free" > "Audit"','Para certificado gratis: aplica a Financial Aid (15 días de espera)'],
    verification:'Self-enrollment', source_url:'https://www.coursera.org', official:true, confidence:97,
    requires_card:false, commercial_use:'personal'
  },
  {
    slug:'github-learning-paths', brand:'GitHub', title:'GitHub Skills — Cursos Interactivos Gratis',
    summary:'Aprende Git, GitHub Actions, CI/CD y más con repos interactivos oficiales de GitHub.',
    benefit:'Cursos 100% gratuitos: Introduction to GitHub, GitHub Actions, Code with Copilot, y más — todos interactivos.',
    category:'Education', offer_type:'free', countries:['GLOBAL'],
    requirements:['Cuenta GitHub (gratis)'],
    steps:['Ve a skills.github.com','Elige un curso','Haz clic en "Start course"','Sigue las instrucciones en el repo','Completa los ejercicios para obtener tu badge'],
    verification:'None', source_url:'https://skills.github.com', official:true, confidence:98,
    requires_card:false, commercial_use:'n/a'
  },
  {
    slug:'linkedin-learning-student', brand:'LinkedIn', title:'LinkedIn Learning — Gratis vía Universidad',
    summary:'16,000+ cursos de negocios, tecnología y creatividad — gratis si tu universidad lo ofrece.',
    benefit:'Acceso completo a LinkedIn Learning Premium: 16,000+ cursos, certificados, y rutas de aprendizaje.',
    category:'Education', offer_type:'free', countries:['GLOBAL'],
    requirements:['Tu universidad debe tener licencia LinkedIn Learning','Correo institucional'],
    steps:['Ve a linkedin.com/learning','Haz clic en "Sign in"','Usa tu correo .edu','Si tu universidad tiene licencia, acceso completo se desbloquea','Si no, hay trial de 1 mes gratis con LinkedIn Premium'],
    verification:'Institutional', source_url:'https://www.linkedin.com/learning/', official:true, confidence:88,
    requires_card:false, commercial_use:'personal'
  },

  /* ══════════════ SHOPPING & RETAIL ══════════════ */
  {
    slug:'apple-education-pricing', brand:'Apple', title:'Apple Education Store — Descuento en Mac/iPad',
    summary:'Hasta $400 de descuento en MacBook, iMac y iPad para estudiantes.',
    benefit:'MacBook Air desde $899, MacBook Pro desde $1,299, iPad desde $329 — precios Education. En Back to School: AirPods gratis.',
    category:'Shopping', offer_type:'discount', countries:['US','CA','GB','AU','DE','FR','ES','IT','JP','KR'],
    requirements:['Ser estudiante actual/aceptado o padre de estudiante','Personal de instituciones educativas'],
    steps:['Ve a apple.com/shop/go/edu_institution_landing','Verifica elegibilidad con UNiDAYS o accede directo','Elige tu producto con precio Education','Durante Back to School (julio-septiembre): AirPods gratis con Mac/iPad'],
    verification:'UNiDAYS / Self-declaration', source_url:'https://www.apple.com/shop/go/edu_institution_landing', official:true, confidence:98,
    requires_card:true, commercial_use:'personal', tags:['trending','hot']
  },
  {
    slug:'samsung-student-discount', brand:'Samsung', title:'Samsung Education Store — Hasta 30% Off',
    summary:'Descuentos exclusivos en Galaxy, laptops, tablets y accesorios Samsung.',
    benefit:'Hasta 30% de descuento en productos Samsung: Galaxy S, Galaxy Tab, Galaxy Book laptops y más.',
    category:'Shopping', offer_type:'discount', countries:['US','GB','DE','KR'],
    requirements:['Ser estudiante con correo .edu o verificación SheerID'],
    steps:['Ve a samsung.com/education','Verifica con correo .edu o SheerID','Accede a precios exclusivos','Aplica descuento en checkout'],
    verification:'SheerID / Educational email', source_url:'https://www.samsung.com/us/shop/all-deals/education/', official:true, confidence:92,
    requires_card:true, commercial_use:'personal'
  },
  {
    slug:'dell-student-discount', brand:'Dell', title:'Dell University — Descuentos para Estudiantes',
    summary:'Laptops, monitores y accesorios Dell y Alienware con precios educativos.',
    benefit:'Descuento extra en laptops XPS, Inspiron y Alienware + cupones exclusivos para estudiantes.',
    category:'Shopping', offer_type:'discount', countries:['US','CA','GB'],
    requirements:['Verificar condición de estudiante en Dell University'],
    steps:['Ve a dell.com/member/university','Regístrate con correo .edu','Accede a precios y cupones exclusivos','Aplica descuento al comprar'],
    verification:'Educational email', source_url:'https://www.dell.com/en-us/lp/member-university', official:true, confidence:91,
    requires_card:true, commercial_use:'personal'
  },

  /* ══════════════ GAMING ══════════════ */
  {
    slug:'unity-student', brand:'Unity', title:'Unity Student Plan — Gratis',
    summary:'Motor de juegos Unity Pro gratis para estudiantes — crea juegos, apps 3D y experiencias XR.',
    benefit:'Unity Pro gratis para estudiantes: todas las features profesionales, sin marca de agua, sin royalties educativos.',
    category:'Gaming', offer_type:'free', countries:['GLOBAL'],
    requirements:['Ser estudiante de institución acreditada','Verificación educativa'],
    steps:['Ve a unity.com/products/unity-student','Crea cuenta Unity','Verifica con correo .edu o documento','Descarga Unity Pro gratis'],
    verification:'Education verification', source_url:'https://unity.com/products/unity-student', official:true, confidence:94,
    requires_card:false, commercial_use:'no'
  },
  {
    slug:'unreal-engine-student', brand:'Epic Games', title:'Unreal Engine — Gratis para Todos',
    summary:'El motor de juegos más potente del mundo, completamente gratis para aprender y crear.',
    benefit:'Unreal Engine 5 gratis: motor completo, nanite, lumen, MetaHuman — solo se paga royalties si tu juego gana $1M+.',
    category:'Gaming', offer_type:'free', countries:['GLOBAL'],
    requirements:['Crear cuenta Epic Games (gratis para todos)'],
    steps:['Ve a unrealengine.com','Descarga Unreal Engine 5 gratis','Crea cuenta Epic Games','Empieza a crear — no hay costo hasta $1M en ingresos'],
    verification:'None', source_url:'https://www.unrealengine.com', official:true, confidence:99,
    requires_card:false, commercial_use:'yes-with-royalties'
  },

  /* ══════════════ TRAVEL & TRANSPORT ══════════════ */
  {
    slug:'isic-card', brand:'ISIC', title:'ISIC Card — Carnet Internacional de Estudiante',
    summary:'La tarjeta de identidad estudiantil reconocida en 130+ países — descuentos en viajes, museos y más.',
    benefit:'150,000+ descuentos en todo el mundo: museos, transporte, alojamiento, comida, entretenimiento y más.',
    category:'Travel', offer_type:'discount', countries:['GLOBAL'],
    requirements:['Ser estudiante de tiempo completo','Pagar ~$20 por la tarjeta (varía por país)'],
    steps:['Ve a isic.org','Solicita tu ISIC Card','Sube prueba de estudiante','Paga la tarjeta (~$20)','Recibe tu carnet digital y/o físico'],
    verification:'ISIC verification', source_url:'https://www.isic.org', official:true, confidence:97,
    requires_card:false, commercial_use:'personal'
  },

  /* ══════════════ FINANCE ══════════════ */
  {
    slug:'notion-student-free', brand:'Notion', title:'Notion Education — 100% Gratis',
    summary:'El workspace todo-en-uno para notas, tareas, wikis y proyectos — plan Pro gratis.',
    benefit:'Plan Personal Pro gratis: páginas ilimitadas, subidas ilimitadas, historial de 30 días, compartir con invitados.',
    category:'Productivity', offer_type:'free', countries:['GLOBAL'],
    requirements:['Estudiante o docente de educación superior','Correo .edu reconocido'],
    steps:['Usa tu correo .edu como email principal en Notion','Ve a Settings → Plans','Selecciona "Get Education Plan"','Re-verifica cada año para mantener el beneficio'],
    verification:'Educational email', source_url:'https://www.notion.com/help/notion-for-education', official:true, confidence:99,
    requires_card:false, commercial_use:'check-terms', tags:['must-have']
  },

  /* ══════════════ SECURITY ══════════════ */
  {
    slug:'1password-student', brand:'1Password', title:'1Password — Gratis via GitHub Student Pack',
    summary:'El gestor de contraseñas premium #1 para proteger todas tus cuentas.',
    benefit:'1Password gratis por 1 año ($36 valor) via GitHub Student Developer Pack.',
    category:'Security', offer_type:'free', countries:['GLOBAL'],
    requirements:['GitHub Student Developer Pack activo'],
    steps:['Activa GitHub Education Pack','Ve a 1password.com/github-student','Canjea tu año gratis','Instala 1Password en todos tus dispositivos'],
    verification:'GitHub Education', source_url:'https://www.1password.com', official:true, confidence:92,
    requires_card:false, commercial_use:'personal'
  },
  {
    slug:'bitwarden-student', brand:'Bitwarden', title:'Bitwarden — Gestor de Contraseñas Gratis',
    summary:'Gestor de contraseñas open source, gratis para siempre, con apps para todo.',
    benefit:'Plan gratuito para siempre: contraseñas ilimitadas, dispositivos ilimitados, generador, autofill.',
    category:'Security', offer_type:'free', countries:['GLOBAL'],
    requirements:['Crear cuenta (gratis para todos)'],
    steps:['Ve a bitwarden.com','Crea cuenta gratis','Descarga apps para navegador, móvil y escritorio','Importa contraseñas de tu navegador'],
    verification:'None', source_url:'https://bitwarden.com', official:true, confidence:99,
    requires_card:false, commercial_use:'yes'
  },

  /* ══════════════ HEALTH ══════════════ */
  {
    slug:'headspace-student', brand:'Headspace', title:'Headspace — Meditación a Precio Estudiante',
    summary:'Meditación guiada, mindfulness y sueño con descuento de hasta 85% para estudiantes.',
    benefit:'Headspace Premium a $9.99/año (vs ~$70/año normal) — 85% de descuento para estudiantes verificados.',
    category:'Health', offer_type:'discount', countries:['US','GB','CA','AU'],
    requirements:['Estudiante en país elegible','Verificación vía SheerID'],
    steps:['Ve a headspace.com/studentplan','Haz clic en "Get Student plan"','Verifica con SheerID','Paga $9.99/año','Descarga la app y empieza a meditar'],
    verification:'SheerID', source_url:'https://www.headspace.com/studentplan', official:true, confidence:93,
    requires_card:true, commercial_use:'personal'
  },
];

export const SOURCES = [
  ['GitHub Education','https://education.github.com/pack','Development',['GLOBAL']],
  ['Microsoft Azure for Students','https://azure.microsoft.com/en-us/free/students','Cloud',['GLOBAL']],
  ['Autodesk Education','https://www.autodesk.com/education/edu-software/overview','Design',['GLOBAL']],
  ['JetBrains Education','https://www.jetbrains.com/community/education/#students','Development',['GLOBAL']],
  ['Notion for Education','https://www.notion.com/help/notion-for-education','Productivity',['GLOBAL']],
  ['Adobe Students','https://www.adobe.com/creativecloud/buy/students.html','Creative',['REGIONAL']],
  ['Spotify Student','https://www.spotify.com/student/','Streaming',['REGIONAL']],
  ['AWS Educate','https://aws.amazon.com/education/awseducate/','Cloud',['GLOBAL']],
  ['Figma Education','https://www.figma.com/education/','Design',['GLOBAL']],
  ['Canva Education','https://www.canva.com/education/','Design',['GLOBAL']],
  ['Microsoft 365 Education','https://www.microsoft.com/education/students','Productivity',['GLOBAL']],
  ['GitKraken Students','https://www.gitkraken.com/github-student-developer-pack','Development',['GLOBAL']],
  ['GitHub Copilot Education','https://github.com/features/copilot','AI',['GLOBAL']],
  ['MongoDB for Students','https://www.mongodb.com/students','Development',['GLOBAL']],
  ['Apple Music Student','https://www.apple.com/apple-music/','Streaming',['REGIONAL']],
  ['YouTube Premium Student','https://www.youtube.com/premium/student','Streaming',['REGIONAL']],
  ['DigitalOcean Student','https://www.digitalocean.com','Cloud',['GLOBAL']],
  ['Google Cloud Education','https://cloud.google.com/edu','Cloud',['GLOBAL']],
  ['Amazon Prime Student','https://www.amazon.com/primestudent','Streaming',['US','GB','DE']],
  ['ChatGPT Student','https://openai.com/index/chatgpt-student/','AI',['US']],
  ['Apple Education Store','https://www.apple.com/shop/go/edu_institution_landing','Shopping',['GLOBAL']],
  ['Samsung Education','https://www.samsung.com/us/shop/all-deals/education/','Shopping',['US']],
  ['Coursera','https://www.coursera.org','Education',['GLOBAL']],
  ['Unity Student','https://unity.com/products/unity-student','Gaming',['GLOBAL']],
  ['Unreal Engine','https://www.unrealengine.com','Gaming',['GLOBAL']],
  ['ISIC Card','https://www.isic.org','Travel',['GLOBAL']],
  ['Headspace Student','https://www.headspace.com/studentplan','Health',['US','GB']],
  ['1Password Student','https://www.1password.com','Security',['GLOBAL']],
  ['Bitwarden','https://bitwarden.com','Security',['GLOBAL']],
  ['LinkedIn Learning','https://www.linkedin.com/learning/','Education',['GLOBAL']],
  ['Grammarly Student','https://www.grammarly.com/edu','Productivity',['GLOBAL']],
  ['Dell University','https://www.dell.com/en-us/lp/member-university','Shopping',['US']],
  ['Heroku Student','https://www.heroku.com/github-students','Cloud',['GLOBAL']],
  ['Namecheap Student','https://www.namecheap.com','Hosting',['GLOBAL']],
  ['Google Workspace Education','https://workspace.google.com/products/education/','Productivity',['GLOBAL']],
  ['GitHub Skills','https://skills.github.com','Education',['GLOBAL']],
  /* ── Discovery aggregators: scanned for new leads ── */
  ['StudentOffers.co','https://www.studentoffers.co','Aggregator',['GLOBAL']],
  ['UNiDAYS','https://www.myunidays.com','Aggregator',['REGIONAL']],
  ['Student Beans','https://www.studentbeans.com','Aggregator',['REGIONAL']],
  ['GitHub Education Partners','https://education.github.com/pack/partners','Aggregator',['GLOBAL']],
];
