export type ChapterOneChange = { skill: string; description: string };
export type ChapterTwoChange = { text: string };
export type BalanceClass<T> = { name: string; slug: string; changes: T[] };

export const classOrder = [
  'Warg','Blood Rose','Samurai','Divine Templar','Elemental Weaver','Assassin','Storm Blaster','Death Knight','Doombringer','Soulhound',
  'Sagittarius','Moonlight Sentinel','Ghost Sentinel','Trickster','Adventurer','Wind Rider','Ghost Hunter','Maestro','Fortune Seeker',
  'Dreadnought','Duelist','Titan','Grand Khavatari','Vanguard Rider','Dominator','Doomcryer','Hell Knight','Phoenix Knight',
  "Eva's Templar",'Shillien Templar','Sword Muse','Spectral Dancer','Hierophant',"Eva's Saint",'Shillien Saint','Cardinal',
  'Storm Screamer','Archmage','Soultaker','Mystic Muse','Elemental Master','Arcana Lord','Spectral Master'
];

const aliases = new Map([
  ['element weaver','Elemental Weaver'],
  ['elemental weaver','Elemental Weaver'],
  ['assasin','Assassin'],
  ['assassin','Assassin']
]);

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const compact = (value: string) => normalize(value).replace(/[^a-z0-9]/g,'');
export const slugifyClass = (value: string) => normalize(value).replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');

const classLookup = new Map(classOrder.map(name => [normalize(name),name]));
aliases.forEach((canonical,alias) => classLookup.set(alias,canonical));

const canonicalClass = (line: string) => classLookup.get(normalize(line));
const usefulLines = (raw: string) => raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);

export function cleanBalanceText(value: string) {
  return value
    .replace(/Ruse time/gi,'Reuse time')
    .replace(/Resue time/gi,'Reuse time')
    .replace(/SKill/g,'Skill')
    .replace(/Parasie Rose/g,'Parasite Rose')
    .replace(/requies/gi,'requires')
    .replace(/replacedd/gi,'replaced')
    .replace(/can be learnt/gi,'can be learned')
    .replace(/can be learn/gi,'can be learned')
    .replace(/Nobless\b/g,'Noblesse')
    .replace(/PVP/g,'PvP')
    .replace(/PVE/g,'PvE')
    .replace(/P\.atk/gi,'P. Atk.')
    .replace(/M\.atk/gi,'M. Atk.')
    .replace(/P\.def/gi,'P. Def.')
    .replace(/M\.def/gi,'M. Def.')
    .replace(/A\.tk Speed/gi,'Atk. Spd.')
    .replace(/Hammer RumbleEarthquake/g,'Hammer Rumble; Earthquake')
    .replace(/\s+-\s+-\s+/g,' ')
    .replace(/,\s+-\s+Skill Power/g,', Skill Power')
    .replace(/\s+/g,' ')
    .trim();
}

export function parseChapterOne(raw: string): BalanceClass<ChapterOneChange>[] {
  const lines = usefulLines(raw);
  const groups = new Map<string,ChapterOneChange[]>();
  let current = '';
  for (let index=0; index<lines.length; index++) {
    const heading = canonicalClass(lines[index]);
    if (heading) {
      current = heading;
      if (!groups.has(current)) groups.set(current,[]);
      continue;
    }
    if (!current || index+1>=lines.length || canonicalClass(lines[index+1])) continue;
    groups.get(current)!.push({skill:cleanBalanceText(lines[index]),description:cleanBalanceText(lines[index+1])});
    index++;
  }
  return classOrder.filter(name => groups.has(name)).map(name => ({name,slug:slugifyClass(name),changes:groups.get(name)!}));
}

const isDiscordMetadata = (line: string) => line === 'OP' || /Role icon|Project Manager/.test(line) || /^[—-]\s*\d{1,2}:\d{2}$/.test(line);

export function parseChapterTwo(raw: string): BalanceClass<ChapterTwoChange>[] {
  const groups = new Map<string,ChapterTwoChange[]>();
  let current = '';
  for (const line of usefulLines(raw)) {
    const heading = canonicalClass(line);
    if (heading) {
      current = heading;
      if (!groups.has(current)) groups.set(current,[]);
      continue;
    }
    if (!current || isDiscordMetadata(line)) continue;
    const text = cleanBalanceText(line);
    if (current === 'Maestro' && text.includes('; Earthquake →')) {
      const [hammerRumble, earthquake] = text.split('; ', 2);
      groups.get(current)!.push({text:hammerRumble},{text:earthquake});
      continue;
    }
    groups.get(current)!.push({text});
  }
  return classOrder.filter(name => groups.has(name)).map(name => ({name,slug:slugifyClass(name),changes:groups.get(name)!}));
}

const specialSkillAliases = new Map([
  ['maxblowlandrate',['maximumblowsuccessrate']],
  ['mechanicalmasterpiece',['mechanicalmasterpiece']]
]);

function skillAppears(skill: string, chapterTwoText: string) {
  const complete = compact(skill);
  const candidates = skill.split(/\s*\/\s*|\s*,\s*|\s*:\s*/).map(compact).filter(part => part.length>=4);
  const aliasesForSkill = specialSkillAliases.get(complete) || [];
  return [complete,...candidates,...aliasesForSkill].some(candidate => chapterTwoText.includes(candidate));
}

const revertedChapterOneChanges = new Set([
  'Sword Muse:Song of Wind Legato',
  'Spectral Dancer:Dance of Fury Legato'
]);

export function compareChapters(chapterOne: BalanceClass<ChapterOneChange>[], chapterTwo: BalanceClass<ChapterTwoChange>[]) {
  const oldByClass = new Map(chapterOne.map(group => [group.name,group.changes]));
  return chapterTwo.map(group => {
    const currentText = compact(group.changes.map(change => change.text).join(' '));
    const removed = (oldByClass.get(group.name) || []).filter(change =>
      !revertedChapterOneChanges.has(`${group.name}:${change.skill}`) &&
      !skillAppears(change.skill,currentText)
    );
    return {...group,removed};
  });
}

const nestedSkillsByClass = new Map<string,string[]>([
  ['Maestro',['Earth Tremor','Hammer Rumble','Earthquake']],
  ['Fortune Seeker',['Crushing Leap','Earthquake']],
  ['Arcana Lord',['Ethereal Strike','Ray of Light']],
  ['Spectral Master',['Ethereal Strike','Ray of Light']]
]);

export function splitCurrentChange(text: string, className = '') {
  const nested = (nestedSkillsByClass.get(className) || []).some(skill => text.startsWith(`${skill} →`));
  const namedWithoutColon = [
    'Arcane Shield',
    'Maximum Blow success rate',
    'Riot',
    'Vortex, Fatal Strike and Armor Crush'
  ].find(skill => text.startsWith(skill));
  if (namedWithoutColon) {
    const description = text.slice(namedWithoutColon.length).trim().replace(/^[:.-]\s*/,'');
    return {title:namedWithoutColon,description:description ? description[0].toUpperCase()+description.slice(1) : '',nested};
  }
  if (text.startsWith('New Skill: Enhanced Blink')) {
    const description = text.slice('New Skill: Enhanced Blink'.length).trim().replace(/^[:.-]\s*/,'');
    return {title:'New Skill - Enhanced Blink',description,nested};
  }
  if (['Archmage','Storm Screamer','Soultaker'].includes(className) && /^New skill: Blink\b/i.test(text)) {
    const description = text.replace(/^New skill: Blink\.?\s*/i,'');
    return {title:'New Skill - Blink',description,nested};
  }
  const arrow = text.indexOf('→');
  if (nested && arrow>0) return {title:text.slice(0,arrow).trim(),description:text.slice(arrow).trim(),nested};
  const separator = text.indexOf(':');
  if (separator<1) return {title:'',description:text,nested};
  return {title:text.slice(0,separator).trim(),description:text.slice(separator+1).trim(),nested};
}

export function explicitRemovalType(description: string, title = '') {
  const effectBadgeExceptions = new Set([
    'Soul Smash',
    'Amazing Soul Smash',
    'Blessed Fortune Time',
    'Revival',
    'Thunder Explosion',
    'Flame Explosion',
    'Void Explosion'
  ]);
  if (/^removed\.?$/i.test(description.trim())) return 'skill';
  if (effectBadgeExceptions.has(title)) return '';
  if (!/\bremoved\b/i.test(description)) return '';
  if (/shield is removed when|(?:fixed )?cooldown[^.]*removed|restriction[^.]*removed/i.test(description)) return '';
  return 'effect';
}
