/**
 * Profanity filter for handles/callsigns.
 * Normalises input (leet speak, repeated chars, zero-width) before checking.
 * Substring match — "dickwhistle" fails even if not explicitly listed.
 */

const BANNED = [
  // — Racial / Ethnic —
  'nigger','nigga','niggers','niggas','negro','nig','coon','darkie','darky','sambo',
  'jigaboo','jiggaboo','porchmonkey','spook','spade','pickaninny','golliwog','buckwheat',
  'uncletom','jiggabo',
  'kike','kyke','jewbag','jewboy','heeb','hymie','yid','zhid','jewfag','jew',
  'spic','spick','beaner','wetback','greaser','borderhopper',
  'chink','gook','slanteye','zipperhead','chinaman','chingchong','paki','raghead',
  'towelhead','cameljockey',
  'sandnigger','muzzie','muzrat','jihadist',
  'redskin','injun','squaw','wagonburner',
  'mick','paddy','wop','dago','guinea','greaseball','kraut','polack',
  'gypo','pikey','tinker',
  'halfbreed','mulatto','mongrel',

  // — Sexuality / Gender —
  'faggot','fag','faggy','fagget','faggit','dyke','lesbo','lezbo',
  'tranny','trannie','shemale','ladyboy','homo','homofag','sodomite',
  'battyboy','bugger','pansy','sissy',

  // — Disability —
  'retard','retarded','tard','spaz','spastic','mongoloid','mong','cripple','gimp',

  // — Sexual / Explicit —
  'fuck','fucker','fucked','fucking','fuckface','fuckhead','fuckwit','fuckboi',
  'motherfucker','clusterfuck','assfuck','facefuck',
  'shit','shite','shithead','shitface','shitbag','shithole','bullshit',
  'bitch','biatch','bytch','biotch','bitches','bitchy','bitchass',
  'cunt','kunt',
  'dick','dickhead','dickface','dickwad','dickweed','dicksucker',
  'cock','cocksucker','cockhead','cockface','cockwomble',
  'pussy','penis','prick',
  'asshole','arsehole','asswipe','assclown','asshat','assbag',
  'vagina','twat','snatch','clunge','cooch','cooter',
  'slut','slutty','slag','sket','whore','hooker','skank','hoe','thot','trollop',
  'cumslut','cumwhore','cumdumpster','cumguzzler',
  'blowjob','handjob','rimjob','gangbang','cumshot','creampie',
  'dildo','buttplug','buttfuck','fisting','teabagging','teabag',
  'tits','titty','titties','boob','boobs','boobies',
  'nipple','nutsack','ballsack','scrotum','schlong',
  'boner','erection','hardon','cum','jizz','spunk','semen',
  'wanker','wank','tosser','jerkoff','jackoff','fap','fapping',

  // — Violence / Self-harm —
  'rape','rapist','raping','molest','molester',
  'pedo','pedophile','paedo','paedophile','groomer',
  'kys','killself','killurself','killyourself','neckyourself',
  'suicide','suicidal','selfharm','slityourwrists',
  'lynch','lynching','genocide','massacre','decapitate','behead',

  // — Hate Symbols / Extremism —
  'nazi','nazism','hitler','heil','siegheil',
  'kkk','klan','kuklux','aryan','whitepride','whitepower',
  '1488','14words',
  'jihad','atomwaffen','boogaloo',
  'incel','femoid','foid','roastie',

  // — Impersonation / Platform Abuse —
  'admin','administrator','moderator','solshot','official','support','helpdesk',
  'staff','developer','devteam',

  // — Drugs —
  'cocaine','heroin','methamphetamine','crackhead','fentanyl',

  // — Trolling (lighter) —
  'dumbass','dipshit','dumbfuck','numbnuts',
  'douchebag','scumbag','bellend','knobhead','gobshite',
];

// Build regex from banned words (escape special chars, join with |)
const pattern = new RegExp(
  BANNED.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'i'
);

/**
 * Normalise a string for profanity checking:
 * - lowercase
 * - strip zero-width / invisible unicode
 * - map common leet-speak substitutions
 * - collapse repeated characters (aaassss → as)
 */
function normalise(text) {
  let s = text.toLowerCase();
  // Strip zero-width chars + invisible unicode
  s = s.replace(/[\u200B-\u200F\u2028-\u202F\uFEFF\u00AD]/g, '');
  // Leet speak mapping
  s = s.replace(/0/g, 'o')
       .replace(/1/g, 'i')
       .replace(/3/g, 'e')
       .replace(/4/g, 'a')
       .replace(/5/g, 's')
       .replace(/7/g, 't')
       .replace(/8/g, 'b')
       .replace(/@/g, 'a')
       .replace(/\$/g, 's')
       .replace(/!/g, 'i')
       .replace(/\+/g, 't');
  // Collapse repeated chars (3+ of same → 1)
  s = s.replace(/(.)\1{1,}/g, '$1');
  return s;
}

// Allowlist: innocent words containing banned substrings (e.g. jewel contains jew)
const allowPattern = /jewel|jewelry|jeweler|jewell/gi;

export function containsProfanity(text) {
  // Strip allowed words first, then check remainder
  const rawClean = text.toLowerCase().replace(allowPattern, '');
  const normClean = normalise(text).replace(allowPattern, '');
  return pattern.test(rawClean) || pattern.test(normClean);
}
