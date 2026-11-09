export interface Lesson {
  key: string
  language: string
  week: number | null
  script: string
}

export const LESSONS: Lesson[] = [
  {
    key: 'hausa/week_16.wav',
    language: 'hausa',
    week: 16,
    script:
      'Sannu uwa mai juna biyu. Wannan shine mako na sha shida daga CradleDial. Ki ci abinci mai gina jiki da ganyayyaki, kuma ki ziyarci asibiti.',
  },
  {
    key: 'yoruba/week_20.wav',
    language: 'yoruba',
    week: 20,
    script:
      'E ku amojuba iya aboyun. Oseogun ni eyi lati CradleDial. E maa je ounjẹ ti o dara fun ara, ki e si lo si ile iwosan.',
  },
  {
    key: 'english/week_16.wav',
    language: 'english',
    week: 16,
    script:
      'Hello Mama, welcome to Week 16 with CradleDial. Remember to take your iron and folic acid tablets daily and drink clean water.',
  },
  {
    key: 'pidgin/week_16.wav',
    language: 'pidgin',
    week: 16,
    script:
      'How far Mama! Na Week 16 for CradleDial be this. Make you chop better food with green leaf and drink clean water every day.',
  },
  {
    key: 'igbo/week_16.wav',
    language: 'igbo',
    week: 16,
    script:
      'Nnoo nne, nke a bu izu iri na isii site na CradleDial. Rie nri na-edozi ahu ma na-anwu mmiri di ocha.',
  },
  {
    key: 'emergency/ward4_cholera.wav',
    language: 'emergency',
    week: null,
    script:
      'Important Emergency Alert from your Local Government Health Office for Ward 4. There is a cholera outbreak reported nearby. Please boil all drinking water before use and visit the Primary Healthcare Center immediately if you feel unwell.',
  },
]

const EXACT_KEYS = new Set(LESSONS.filter((lesson) => lesson.week !== null).map((lesson) => lesson.key))

export function audioKey(language: string, week: number): string {
  const exact = `${language}/week_${week}.wav`
  if (EXACT_KEYS.has(exact)) return exact
  if (language === 'yoruba') return 'yoruba/week_20.wav'
  return `${language}/week_16.wav`
}

export function lessonScript(key: string): string {
  return (
    LESSONS.find((lesson) => lesson.key === key)?.script ??
    'Thank you for listening to CradleDial. Take care of yourself and your baby.'
  )
}

export function publicAudioUrl(base: string, key: string): string {
  return `${base.replace(/\/+$/, '')}/${key}`
}

export function workerAudioUrl(origin: string, key: string): string {
  return `${origin.replace(/\/+$/, '')}/audio/${key.replace(/^\/+/, '')}`
}

export function playbackUrl(requestUrl: string, keyOrUrl: string): string {
  const origin = new URL(requestUrl).origin
  if (keyOrUrl.startsWith('/audio/')) return `${origin}${keyOrUrl}`
  if (keyOrUrl.startsWith('http://') || keyOrUrl.startsWith('https://')) {
    const path = new URL(keyOrUrl).pathname.replace(/^\/+/, '')
    const key = path.startsWith('audio/') ? path.slice('audio/'.length) : path
    if (key.endsWith('.wav')) return workerAudioUrl(origin, key)
  }
  return workerAudioUrl(origin, keyOrUrl.replace(/^\/+/, '').replace(/^audio\//, ''))
}
