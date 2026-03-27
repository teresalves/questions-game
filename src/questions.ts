export interface QuestionPack {
  id: string;
  name: string;
  description: string;
  questions: string[];
}

export const PACKS: QuestionPack[] = [
  {
    id: "sfw",
    name: "Party Mode",
    description: "Clean fun for everyone",
    questions: [
      "forget their own birthday",
      "survive a zombie apocalypse",
      "accidentally become famous",
      "get lost in their own neighborhood",
      "win a hot dog eating contest",
      "become a millionaire by accident",
      "trip on a flat surface",
      "cry during a Disney movie",
      "talk their way out of a speeding ticket",
      "fall asleep during their own wedding",
      "befriend a wild animal",
      "start a cult without realizing it",
      "go viral on the internet for something embarrassing",
      "survive on a deserted island the longest",
      "accidentally set something on fire",
      "get into a fight with a toddler and lose",
      "become president of a small country",
      "eat something off the floor",
      "sleep through an earthquake",
      "show up to the wrong wedding and stay",
      "laugh at the worst possible moment",
      "get banned from a buffet",
      "accidentally send a text to the wrong person",
      "win a reality TV show",
      "adopt 10 cats",
      "become a supervillain",
      "forget where they parked for 3 hours",
      "start a flash mob in a grocery store",
      "get arrested for something ridiculous",
      "still use a flip phone in 2030",
    ],
  },
  {
    id: "nsfw",
    name: "After Dark",
    description: "Adults only, no filter",
    questions: [
      "hook up with their boss",
      "get caught watching something embarrassing",
      "send a spicy text to the wrong person",
      "get kicked out of a bar for being too rowdy",
      "wake up in a stranger's bed with no memory",
      "accidentally flash someone in public",
      "have a one night stand and forget their name",
      "get drunk and confess their deepest secret",
      "skinny dip in a public fountain",
      "date two people at the same time",
      "get caught doing the walk of shame",
      "drunk-text their ex at 3am",
      "start a fight at a party over nothing",
      "throw up on someone during a date",
      "get banned from a strip club",
      "lose their clothes on a night out",
      "wake up with a tattoo they don't remember getting",
      "pass out in someone's front yard",
      "get caught talking dirty to themselves",
      "make out with a stranger for a free drink",
      "get blackout drunk at a work event",
      "accidentally like an ex's photo from 3 years ago at 2am",
      "have the most embarrassing browser history",
      "be the loudest person in bed",
      "ghost someone after a great date",
    ],
  },
  {
    id: "dev",
    name: "Software Engineers",
    description: "For the technically inclined",
    questions: [
      "push directly to main on a Friday at 5pm",
      "write code with zero comments and call it 'self-documenting'",
      "mass-reject pull requests for missing semicolons",
      "spend 6 hours debugging only to find a typo",
      "deploy to production without testing",
      "rewrite the entire codebase in Rust 'for fun'",
      "have 200 open browser tabs of Stack Overflow",
      "accidentally drop the production database",
      "use Comic Sans in their IDE",
      "write a 500-line function and call it clean",
      "argue about tabs vs spaces for 3 hours",
      "automate a 5-minute task with a 3-week script",
      "claim 'it works on my machine' with a straight face",
      "name their variables a, b, c, aa, bb, cc",
      "mass-commit with the message 'fixed stuff'",
      "use AI to write their entire PR and pretend they did it",
      "fall asleep during a standup meeting",
      "have a mass-meltdown over a merge conflict",
      "build their own framework instead of using an existing one",
      "have the most unread Slack messages",
      "accidentally expose API keys on GitHub",
      "refuse to use any library they didn't write themselves",
      "mass-quit after a failed deployment",
      "write unit tests after the deadline",
      "use a 10-year-old version of Node.js in production",
      "have the most chaotic .vimrc / .bashrc",
      "mass-refactor code the night before a release",
      "add a TODO comment and never come back to it",
      "mass-over-engineer a simple CRUD app",
      "mass-delete a branch someone was still using",
    ],
  },
];

export function getQuestions(packIds: string[]): string[] {
  const selected = PACKS.filter((p) => packIds.includes(p.id));
  if (selected.length === 0) {
    return PACKS[0].questions;
  }
  // Merge and deduplicate
  const all = selected.flatMap((p) => p.questions);
  return [...new Set(all)];
}
