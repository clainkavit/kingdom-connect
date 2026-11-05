export type NotificationLanguage = "en" | "sw";

export const notificationCategories = [
  "account",
  "security",
  "admin_actions",
  "business",
  "connections",
  "messages",
  "opportunities",
  "ideas",
  "plans",
  "matches",
  "learning",
  "reports",
  "investor",
] as const;

export type NotificationCategory = (typeof notificationCategories)[number];

/** Always emailed; members cannot switch these off (PRD section 14, decided 2 Nov 2026). */
export const criticalCategories: readonly NotificationCategory[] = [
  "account",
  "security",
  "admin_actions",
];

/** The categories with an email switch in S46. Report outcomes are in-app only. */
export const emailSwitchCategories: readonly NotificationCategory[] = notificationCategories.filter(
  (c) => !criticalCategories.includes(c) && c !== "reports",
);

export type EmailChannel = "yes" | "digest" | "weekly" | "no";

export type NotificationText = { title: string; message: string; push?: string; digest?: string };

export type NotificationCopy = {
  category: NotificationCategory;
  inApp: boolean;
  email: EmailChannel;
  push: boolean;
  opens: string;
  en: NotificationText;
  sw: NotificationText;
};

const categoryByCode: [RegExp, NotificationCategory][] = [
  [/^A\d+$/, "account"],
  [/^B\d+$/, "business"],
  [/^C[12]$/, "connections"],
  [/^C3$/, "messages"],
  [/^O\d+$/, "opportunities"],
  [/^I\d+$/, "ideas"],
  [/^P\d+$/, "plans"],
  [/^S\d+$/, "matches"],
  [/^[TW]\d+$/, "learning"],
  [/^R\d+$/, "reports"],
  [/^V\d+$/, "investor"],
  [/^(L1|X1|E\d+|Y\d+)$/, "security"],
  [/^(X[23]|H\d+)$/, "admin_actions"],
];

export function categoryOfCode(code: string): NotificationCategory {
  const match = categoryByCode.find(([pattern]) => pattern.test(code));
  if (!match) throw new Error(`No notification category for ${code}`);
  return match[1];
}

/** docs/screens.md, Notification to screen, as member app paths. */
const opensByCode: [RegExp, string][] = [
  [/^A5$/, "/verify"],
  [/^(L1|X1)$/, "/login"],
  [/^A\d+$/, "/registration"],
  [/^B\d+$/, "/settings"],
  [/^C[12]$/, "/connections"],
  [/^C3$/, "/messages"],
  [/^E\d+$/, "/settings/privacy"],
  [/^X3$/, "/"],
  [/^[OX]\d+$/, "/opportunities"],
  [/^[IH]\d+$/, "/ideas"],
  [/^P\d+$/, "/ideas"],
  [/^S\d+$/, "/opportunities"],
  [/^[TW]\d+$/, "/training"],
  [/^R\d+$/, "/reports"],
  [/^V\d+$/, "/ideas"],
];

export function opensForCode(code: string): string {
  return opensByCode.find(([pattern]) => pattern.test(code))?.[1] ?? "/";
}

export type NotificationValues = Record<string, string | number>;

/** Fills {placeholders}; one with no value stays as written so a gap is visible in tests. */
export function fillTemplate(template: string, values: NotificationValues): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}

export function emailWanted(
  copy: Pick<NotificationCopy, "category" | "email">,
  emailSwitchedOn: boolean,
): boolean {
  if (copy.email === "no") return false;
  if (criticalCategories.includes(copy.category)) return true;
  return emailSwitchedOn;
}

export function notificationText(
  copy: Pick<NotificationCopy, "en" | "sw">,
  language: NotificationLanguage,
  values: NotificationValues,
): NotificationText {
  const text = copy[language];
  return {
    title: fillTemplate(text.title, values),
    message: fillTemplate(text.message, values),
    ...(text.push ? { push: fillTemplate(text.push, values) } : {}),
    ...(text.digest ? { digest: fillTemplate(text.digest, values) } : {}),
  };
}

export const notificationCopy = {
  A1: {
    category: "account",
    inApp: true,
    email: "yes",
    push: false,
    opens: "/registration",
    en: {
      title: "We got your application",
      message:
        "Thanks for joining {platform_name}. We are checking your details and will tell you the result soon.",
    },
    sw: {
      title: "Tumepokea ombi lako",
      message:
        "Asante kwa kujiunga na {platform_name}. Tunakagua taarifa zako na tutakujulisha matokeo hivi karibuni.",
    },
  },
  A2: {
    category: "account",
    inApp: true,
    email: "yes",
    push: true,
    opens: "/registration",
    en: {
      title: "Welcome to {platform_name}",
      message: "Your account is approved. Sign in to get started.",
    },
    sw: {
      title: "Karibu {platform_name}",
      message: "Akaunti yako imeidhinishwa. Ingia ili uanze.",
    },
  },
  A3: {
    category: "account",
    inApp: true,
    email: "yes",
    push: true,
    opens: "/registration",
    en: {
      title: "We could not approve your application",
      message: "Reason: {reason}. You can fix this and send it again once.",
    },
    sw: {
      title: "Hatukuweza kuidhinisha ombi lako",
      message: "Sababu: {reason}. Unaweza kurekebisha na kutuma tena mara moja.",
    },
  },
  A4: {
    category: "account",
    inApp: true,
    email: "yes",
    push: true,
    opens: "/registration",
    en: {
      title: "Your application was not approved",
      message: "Reason: {reason}. This decision is final unless an admin reopens it.",
    },
    sw: {
      title: "Ombi lako halikuidhinishwa",
      message: "Sababu: {reason}. Uamuzi huu ni wa mwisho, isipokuwa msimamizi aufungue tena.",
    },
  },
  A5: {
    category: "account",
    inApp: false,
    email: "yes",
    push: false,
    opens: "/verify",
    en: {
      title: "Your {platform_name} code",
      message:
        "Your code is {code}. It works for 10 minutes. Do not share it with anyone. If you did not try to sign in, ignore this email.",
    },
    sw: {
      title: "Msimbo wako wa {platform_name}",
      message:
        "Msimbo wako ni {code}. Unatumika kwa dakika 10. Usimpe mtu yeyote. Kama hukujaribu kuingia, puuza barua pepe hii.",
    },
  },
  A6: {
    category: "account",
    inApp: true,
    email: "yes",
    push: true,
    opens: "/registration",
    en: {
      title: "Your application is open again",
      message:
        "An administrator reopened your application. Sign in, fix what is needed and send it again.",
    },
    sw: {
      title: "Ombi lako limefunguliwa tena",
      message:
        "Msimamizi amefungua tena ombi lako. Ingia, rekebisha kinachohitajika na ulitume tena.",
    },
  },
  B1: {
    category: "business",
    inApp: true,
    email: "yes",
    push: false,
    opens: "/settings",
    en: {
      title: "Your business is verified",
      message: "You now have Level {level}. Check what is new on your dashboard.",
    },
    sw: {
      title: "Biashara yako imethibitishwa",
      message: "Sasa uko Kiwango cha {level}. Angalia mambo mapya kwenye dashibodi yako.",
    },
  },
  B2: {
    category: "business",
    inApp: true,
    email: "yes",
    push: false,
    opens: "/settings",
    en: {
      title: "We could not approve your business",
      message: "Reason: {reason}. You can upload new documents and try again.",
    },
    sw: {
      title: "Hatukuweza kuidhinisha biashara yako",
      message: "Sababu: {reason}. Unaweza kupakia hati mpya na kujaribu tena.",
    },
  },
  B3: {
    category: "business",
    inApp: true,
    email: "yes",
    push: false,
    opens: "/settings",
    en: {
      title: "Your licence expires soon",
      message: "It expires in {days} days. Upload a new one to keep your Level {level} rights.",
    },
    sw: {
      title: "Leseni yako inakaribia kuisha",
      message: "Inaisha baada ya siku {days}. Pakia mpya ili ubaki na haki za Kiwango cha {level}.",
    },
  },
  B4: {
    category: "business",
    inApp: true,
    email: "yes",
    push: false,
    opens: "/settings",
    en: {
      title: "Your Level {level} rights are paused",
      message: "Your licence has expired. Upload a new one and we will review it.",
    },
    sw: {
      title: "Haki zako za Kiwango cha {level} zimesitishwa",
      message: "Leseni yako imeisha muda. Pakia mpya nasi tutaipitia.",
    },
  },
  C1: {
    category: "connections",
    inApp: true,
    email: "yes",
    push: true,
    opens: "/connections",
    en: {
      title: "New connection request",
      message: "{name} wants to connect with you. Accept or decline.",
    },
    sw: {
      title: "Ombi jipya la kuunganishwa",
      message: "{name} anataka kuunganishwa nawe. Kubali au kataa.",
    },
  },
  C2: {
    category: "connections",
    inApp: true,
    email: "yes",
    push: true,
    opens: "/connections",
    en: {
      title: "You are connected",
      message: "{name} accepted your request. You can message each other now.",
    },
    sw: {
      title: "Mmeunganishwa",
      message: "{name} amekubali ombi lako. Sasa mnaweza kutumiana ujumbe.",
    },
  },
  C3: {
    category: "messages",
    inApp: true,
    email: "digest",
    push: true,
    opens: "/messages",
    en: {
      title: "New message from {name}",
      message: "",
      push: "You have a new message.",
      digest: "You have {count} new messages on {platform_name}.",
    },
    sw: {
      title: "Ujumbe mpya kutoka kwa {name}",
      message: "",
      push: "Una ujumbe mpya.",
      digest: "Una jumbe {count} mpya kwenye {platform_name}.",
    },
  },
  O1: {
    category: "opportunities",
    inApp: true,
    email: "yes",
    push: false,
    opens: "/opportunities",
    en: {
      title: "New application",
      message: "{name} applied for {title}. Take a look.",
    },
    sw: {
      title: "Ombi jipya",
      message: "{name} ametuma maombi ya {title}. Liangalie.",
    },
  },
  O2: {
    category: "opportunities",
    inApp: true,
    email: "yes",
    push: false,
    opens: "/opportunities",
    en: {
      title: "New interest",
      message: "{name} is interested in {title}. Take a look.",
    },
    sw: {
      title: "Nia mpya",
      message: "{name} ameonyesha nia kwenye {title}. Angalia.",
    },
  },
  O3: {
    category: "opportunities",
    inApp: true,
    email: "yes",
    push: true,
    opens: "/opportunities",
    en: {
      title: "Good news",
      message: "You are on the shortlist for {title}.",
    },
    sw: {
      title: "Habari njema",
      message: "Uko kwenye orodha fupi ya {title}.",
    },
  },
  O4: {
    category: "opportunities",
    inApp: true,
    email: "yes",
    push: true,
    opens: "/opportunities",
    en: {
      title: "Update on {title}",
      message: "This one did not work out. Keep looking, there are more opportunities.",
    },
    sw: {
      title: "Taarifa kuhusu {title}",
      message: "Safari hii haikufanikiwa. Endelea kutafuta, kuna fursa nyingine.",
    },
  },
  O5: {
    category: "opportunities",
    inApp: true,
    email: "yes",
    push: true,
    opens: "/opportunities",
    en: {
      title: "Your post is live",
      message: "{title} is approved and members can see it now.",
    },
    sw: {
      title: "Tangazo lako limeanza kuonekana",
      message: "{title} limeidhinishwa na wanachama wanaweza kuliona sasa.",
    },
  },
  O6: {
    category: "opportunities",
    inApp: true,
    email: "yes",
    push: true,
    opens: "/opportunities",
    en: {
      title: "Your post was not approved",
      message: "{title}: {reason}. You can edit it and send it again.",
    },
    sw: {
      title: "Tangazo lako halikuidhinishwa",
      message: "{title}: {reason}. Unaweza kulihariri na kulituma tena.",
    },
  },
  O7: {
    category: "opportunities",
    inApp: true,
    email: "yes",
    push: false,
    opens: "/opportunities",
    en: {
      title: "Your post is hidden for now",
      message: "Someone reported {title}. Our team is reviewing it.",
    },
    sw: {
      title: "Tangazo lako limefichwa kwa muda",
      message: "Mtu ameripoti {title}. Timu yetu inalipitia.",
    },
  },
  O8: {
    category: "opportunities",
    inApp: true,
    email: "yes",
    push: false,
    opens: "/opportunities",
    en: {
      title: "Your post was removed",
      message: "{title}: {reason}.",
    },
    sw: {
      title: "Tangazo lako limeondolewa",
      message: "{title}: {reason}.",
    },
  },
  I1: {
    category: "ideas",
    inApp: true,
    email: "yes",
    push: false,
    opens: "/ideas",
    en: {
      title: "Someone is interested in your idea",
      message: "{name} wants to see {idea_title} as {role}. Review the request.",
    },
    sw: {
      title: "Mtu anavutiwa na wazo lako",
      message: "{name} anataka kuona {idea_title} kama {role}. Pitia ombi lake.",
    },
  },
  I2: {
    category: "ideas",
    inApp: true,
    email: "yes",
    push: false,
    opens: "/ideas",
    en: {
      title: "A verified investor is interested",
      message:
        "Interest in {idea_title}. Sector focus: {sector}. Range: {band}. Review the request.",
    },
    sw: {
      title: "Mwekezaji aliyethibitishwa anavutiwa",
      message: "Nia kwenye {idea_title}. Eneo analolenga: {sector}. Kiwango: {band}. Pitia ombi.",
    },
  },
  I3: {
    category: "ideas",
    inApp: true,
    email: "yes",
    push: true,
    opens: "/ideas",
    en: {
      title: "Your request was approved",
      message: "Accept the NDA to open the details of {idea_title}.",
    },
    sw: {
      title: "Ombi lako limekubaliwa",
      message: "Kubali makubaliano ya usiri (NDA) ili kufungua maelezo ya {idea_title}.",
    },
  },
  I4: {
    category: "ideas",
    inApp: true,
    email: "yes",
    push: false,
    opens: "/ideas",
    en: {
      title: "Update on your request",
      message: "Your request for {idea_title} was not approved.",
    },
    sw: {
      title: "Taarifa kuhusu ombi lako",
      message: "Ombi lako la {idea_title} halikukubaliwa.",
    },
  },
  I5: {
    category: "ideas",
    inApp: true,
    email: "yes",
    push: true,
    opens: "/ideas",
    en: {
      title: "NDA accepted",
      message: "You can now see each other's profiles and message about {idea_title}.",
    },
    sw: {
      title: "Makubaliano ya usiri yamekubaliwa",
      message: "Sasa mnaweza kuona wasifu wa kila mmoja na kutumiana ujumbe kuhusu {idea_title}.",
    },
  },
  I6: {
    category: "ideas",
    inApp: true,
    email: "yes",
    push: false,
    opens: "/ideas",
    en: {
      title: "Access removed",
      message: "The owner has removed your access to {idea_title}.",
    },
    sw: {
      title: "Ufikiaji umeondolewa",
      message: "Mmiliki ameondoa ufikiaji wako wa {idea_title}.",
    },
  },
  P1: {
    category: "plans",
    inApp: true,
    email: "yes",
    push: true,
    opens: "/ideas",
    en: {
      title: "A plan is waiting for you",
      message: "{name} proposed a milestone plan for {item}. Review it and accept.",
    },
    sw: {
      title: "Mpango unakusubiri",
      message: "{name} amependekeza mpango wa hatua kwa {item}. Upitie na uukubali.",
    },
  },
  P2: {
    category: "plans",
    inApp: true,
    email: "yes",
    push: false,
    opens: "/ideas",
    en: {
      title: "Reminder: plan waiting",
      message: "{name}'s plan for {item} expires in 7 days.",
    },
    sw: {
      title: "Ukumbusho: mpango unasubiri",
      message: "Mpango wa {name} kwa {item} unaisha baada ya siku 7.",
    },
  },
  P3: {
    category: "plans",
    inApp: true,
    email: "yes",
    push: false,
    opens: "/ideas",
    en: {
      title: "Plan accepted",
      message:
        "{name} accepted the plan for {item}. Stage 1 is agreed. You can withdraw within 1 hour.",
    },
    sw: {
      title: "Mpango umekubaliwa",
      message:
        "{name} amekubali mpango wa {item}. Hatua ya 1 imekubaliwa. Unaweza kujitoa ndani ya saa 1.",
    },
  },
  P4: {
    category: "plans",
    inApp: true,
    email: "yes",
    push: false,
    opens: "/ideas",
    en: {
      title: "A milestone is done",
      message: "{name} marked {milestone} as done. Please confirm.",
    },
    sw: {
      title: "Hatua imekamilika",
      message: "{name} ameweka {milestone} kuwa imekamilika. Tafadhali thibitisha.",
    },
  },
  P5: {
    category: "plans",
    inApp: true,
    email: "yes",
    push: false,
    opens: "/ideas",
    en: {
      title: "Milestone confirmed",
      message: "{name} confirmed {milestone}.",
    },
    sw: {
      title: "Hatua imethibitishwa",
      message: "{name} amethibitisha {milestone}.",
    },
  },
  P6: {
    category: "plans",
    inApp: true,
    email: "yes",
    push: false,
    opens: "/ideas",
    en: {
      title: "Signed agreement uploaded",
      message: "{name} uploaded the signed agreement for {item}. Please upload yours.",
    },
    sw: {
      title: "Makubaliano yaliyosainiwa yamepakiwa",
      message: "{name} amepakia makubaliano yaliyosainiwa ya {item}. Tafadhali pakia yako.",
    },
  },
  P7: {
    category: "plans",
    inApp: true,
    email: "yes",
    push: false,
    opens: "/ideas",
    en: {
      title: "Plan completed",
      message: "The plan for {item} is complete. Both signed agreements are saved.",
    },
    sw: {
      title: "Mpango umekamilika",
      message: "Mpango wa {item} umekamilika. Makubaliano yote mawili yaliyosainiwa yamehifadhiwa.",
    },
  },
  P8: {
    category: "plans",
    inApp: true,
    email: "yes",
    push: false,
    opens: "/ideas",
    en: {
      title: "Your plan expired",
      message: "{name} did not respond to the plan for {item} in 14 days. You can start it again.",
    },
    sw: {
      title: "Mpango wako umeisha muda",
      message: "{name} hakujibu mpango wa {item} ndani ya siku 14. Unaweza kuuanzisha tena.",
    },
  },
  P9: {
    category: "plans",
    inApp: true,
    email: "yes",
    push: false,
    opens: "/ideas",
    en: {
      title: "Plan withdrawn",
      message: "The plan for {item} was withdrawn by {name}.",
    },
    sw: {
      title: "Mpango umefutwa",
      message: "Mpango wa {item} umefutwa na {name}.",
    },
  },
  P10: {
    category: "plans",
    inApp: true,
    email: "yes",
    push: false,
    opens: "/ideas",
    en: {
      title: "A plan was ended",
      message:
        "{name} ended the plan for {item}. Reason: {reason}. The record stays on your profile.",
    },
    sw: {
      title: "Mpango umesitishwa",
      message:
        "{name} amesitisha mpango wa {item}. Sababu: {reason}. Kumbukumbu inabaki kwenye wasifu wako.",
    },
  },
  S1: {
    category: "matches",
    inApp: true,
    email: "weekly",
    push: false,
    opens: "/opportunities",
    en: {
      title: "New matches for you",
      message: "{count} new opportunities match your skills and location this week.",
    },
    sw: {
      title: "Fursa mpya kwa ajili yako",
      message: "Fursa {count} mpya zinaendana na ujuzi wako na eneo lako wiki hii.",
    },
  },
  T1: {
    category: "learning",
    inApp: true,
    email: "yes",
    push: false,
    opens: "/training",
    en: {
      title: "Tomorrow: {title}",
      message: "It starts at {time}. See you there.",
    },
    sw: {
      title: "Kesho: {title}",
      message: "Inaanza saa {time}. Tutaonana huko.",
    },
  },
  T2: {
    category: "learning",
    inApp: true,
    email: "yes",
    push: false,
    opens: "/training",
    en: {
      title: "Starting soon: {title}",
      message: "It starts in 1 hour, at {time}.",
    },
    sw: {
      title: "Inaanza muda mfupi: {title}",
      message: "Inaanza baada ya saa 1, saa {time}.",
    },
  },
  W1: {
    category: "learning",
    inApp: true,
    email: "yes",
    push: false,
    opens: "/training",
    en: {
      title: "You got a place",
      message: "A spot opened up for {title}, and it is yours.",
    },
    sw: {
      title: "Umepata nafasi",
      message: "Nafasi imepatikana kwenye {title}, na ni yako.",
    },
  },
  R1: {
    category: "reports",
    inApp: true,
    email: "no",
    push: false,
    opens: "/reports",
    en: {
      title: "We reviewed your report",
      message: "Report {ref}: we took action. Thank you for helping keep {platform_name} safe.",
    },
    sw: {
      title: "Tumepitia ripoti yako",
      message: "Ripoti {ref}: tumechukua hatua. Asante kwa kusaidia kuweka {platform_name} salama.",
    },
  },
  R2: {
    category: "reports",
    inApp: true,
    email: "no",
    push: false,
    opens: "/reports",
    en: {
      title: "We reviewed your report",
      message:
        "Report {ref}: no action was needed. Thank you for helping keep {platform_name} safe.",
    },
    sw: {
      title: "Tumepitia ripoti yako",
      message:
        "Ripoti {ref}: hakuna hatua iliyohitajika. Asante kwa kusaidia kuweka {platform_name} salama.",
    },
  },
  V1: {
    category: "investor",
    inApp: true,
    email: "yes",
    push: false,
    opens: "/ideas",
    en: {
      title: "You now have investor tools",
      message:
        "You can show interest anonymously, browse without being seen, use investor filters and keep a saved list. Only you and admins can see this.",
    },
    sw: {
      title: "Sasa una zana za mwekezaji",
      message:
        "Unaweza kuonyesha nia bila kujulikana, kuvinjari kimya kimya, kutumia vichujio vya mwekezaji na kuhifadhi orodha yako. Ni wewe na wasimamizi pekee mnaoweza kuona hili.",
    },
  },
  L1: {
    category: "security",
    inApp: false,
    email: "yes",
    push: false,
    opens: "/login",
    en: {
      title: "Your account is locked for 15 minutes",
      message:
        "There were 5 failed sign-in attempts. Try again after 15 minutes. If this was not you, change your password afterwards.",
    },
    sw: {
      title: "Akaunti yako imefungwa kwa dakika 15",
      message:
        "Kumekuwa na majaribio 5 ya kuingia yaliyoshindwa. Jaribu tena baada ya dakika 15. Kama si wewe, badilisha nenosiri lako baadaye.",
    },
  },
  X1: {
    category: "security",
    inApp: false,
    email: "yes",
    push: false,
    opens: "/login",
    en: {
      title: "Your account is suspended",
      message: "Reason: {reason}. An admin will review it.",
    },
    sw: {
      title: "Akaunti yako imesimamishwa",
      message: "Sababu: {reason}. Msimamizi atalipitia.",
    },
  },
  X2: {
    category: "admin_actions",
    inApp: true,
    email: "yes",
    push: false,
    opens: "/opportunities",
    en: {
      title: "Your posting is paused",
      message: "Reason: {reason}. You cannot post new items until an admin lifts this.",
    },
    sw: {
      title: "Kuchapisha kumesitishwa",
      message: "Sababu: {reason}. Huwezi kuchapisha mapya hadi msimamizi atakapoliondoa.",
    },
  },
  X3: {
    category: "admin_actions",
    inApp: true,
    email: "yes",
    push: false,
    opens: "/",
    en: {
      title: "You received a warning",
      message:
        "Reason: {reason}. Repeated problems can pause your posting or suspend your account.",
    },
    sw: {
      title: "Umepewa onyo",
      message:
        "Sababu: {reason}. Matatizo yakijirudia, kuchapisha kwako kunaweza kusitishwa au akaunti yako kusimamishwa.",
    },
  },
  H1: {
    category: "admin_actions",
    inApp: true,
    email: "yes",
    push: false,
    opens: "/ideas",
    en: {
      title: "Your idea is hidden for now",
      message: "An admin hid {idea_title} while a report is reviewed.",
    },
    sw: {
      title: "Wazo lako limefichwa kwa muda",
      message: "Msimamizi amelificha {idea_title} wakati ripoti inapitiwa.",
    },
  },
  H2: {
    category: "admin_actions",
    inApp: true,
    email: "yes",
    push: false,
    opens: "/ideas",
    en: {
      title: "Your idea was removed",
      message: "{idea_title}: {reason}.",
    },
    sw: {
      title: "Wazo lako limeondolewa",
      message: "{idea_title}: {reason}.",
    },
  },
  E1: {
    category: "security",
    inApp: true,
    email: "yes",
    push: false,
    opens: "/settings/privacy",
    en: {
      title: "Your email was changed",
      message:
        "The sign-in email on {platform_name} was changed. If you did not do this, contact the platform team at once.",
    },
    sw: {
      title: "Barua pepe yako imebadilishwa",
      message:
        "Barua pepe ya kuingia kwenye {platform_name} imebadilishwa. Kama si wewe, wasiliana na timu ya jukwaa mara moja.",
    },
  },
  E3: {
    category: "security",
    inApp: false,
    email: "yes",
    push: false,
    opens: "/settings/privacy",
    en: {
      title: "Confirm your new {platform_name} email",
      message:
        "Your code is {code}. It works for 10 minutes. Do not share it with anyone. If you did not ask to change your email, ignore this email.",
    },
    sw: {
      title: "Thibitisha barua pepe yako mpya ya {platform_name}",
      message:
        "Msimbo wako ni {code}. Unatumika kwa dakika 10. Usimpe mtu yeyote. Kama hukuomba kubadilisha barua pepe yako, puuza barua pepe hii.",
    },
  },
  E4: {
    category: "security",
    inApp: true,
    email: "yes",
    push: false,
    opens: "/settings/privacy",
    en: {
      title: "A request to change your email",
      message:
        "Someone asked to move your {platform_name} account to a new email. An Administrator checks every request. If this was not you, sign in and tell us, or reply to this email.",
    },
    sw: {
      title: "Ombi la kubadilisha barua pepe yako",
      message:
        "Mtu ameomba kuhamisha akaunti yako ya {platform_name} kwenda barua pepe mpya. Msimamizi hukagua kila ombi. Kama si wewe, ingia na utuambie, au jibu barua pepe hii.",
    },
  },
  E5: {
    category: "security",
    inApp: true,
    email: "yes",
    push: false,
    opens: "/settings/privacy",
    en: {
      title: "Your email will change in 48 hours",
      message:
        "An Administrator approved moving your {platform_name} account to the new email. It takes effect in 48 hours. If this was not you, sign in and cancel it in Privacy settings.",
    },
    sw: {
      title: "Barua pepe yako itabadilika baada ya saa 48",
      message:
        "Msimamizi ameidhinisha kuhamisha akaunti yako ya {platform_name} kwenda barua pepe mpya. Itaanza kutumika baada ya saa 48. Kama si wewe, ingia na uifute kwenye Mipangilio ya faragha.",
    },
  },
  E6: {
    category: "security",
    inApp: false,
    email: "yes",
    push: false,
    opens: "/settings/privacy",
    en: {
      title: "We could not move your account",
      message: "Reason: {reason}. You can send a new request.",
    },
    sw: {
      title: "Hatukuweza kuhamisha akaunti yako",
      message: "Sababu: {reason}. Unaweza kutuma ombi jipya.",
    },
  },
  E2: {
    category: "security",
    inApp: true,
    email: "yes",
    push: false,
    opens: "/settings/privacy",
    en: {
      title: "Your phone number was changed",
      message:
        "The phone number on {platform_name} was changed. If you did not do this, contact the platform team at once.",
    },
    sw: {
      title: "Namba yako ya simu imebadilishwa",
      message:
        "Namba ya simu kwenye {platform_name} imebadilishwa. Kama si wewe, wasiliana na timu ya jukwaa mara moja.",
    },
  },
  Y1: {
    category: "security",
    inApp: false,
    email: "yes",
    push: false,
    opens: "/",
    en: {
      title: "Security alert on {platform_name}",
      message: "{alert}. Open the admin dashboard to see it and mark it as seen.",
    },
    sw: {
      title: "Tahadhari ya usalama kwenye {platform_name}",
      message: "{alert}. Fungua dashibodi ya msimamizi kuiona na kuiweka kuwa imeonekana.",
    },
  },
} satisfies Record<string, NotificationCopy>;

export type NotificationKind = keyof typeof notificationCopy;
