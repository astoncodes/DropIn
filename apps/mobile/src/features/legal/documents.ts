import { LEGAL, contactPhrase, deletionPageAddress } from './legal-config';

export type LegalBlock = { kind: 'paragraph'; text: string } | { kind: 'list'; items: string[] };
export type LegalSection = { id: string; heading: string; blocks: LegalBlock[] };
export type LegalDocument = {
  title: string;
  summary: string;
  lastUpdated: string;
  sections: LegalSection[];
};

const p = (text: string): LegalBlock => ({ kind: 'paragraph', text });
const list = (...items: string[]): LegalBlock => ({ kind: 'list', items });

/**
 * The privacy policy. Every statement here describes current behaviour that
 * the code and database enforce — where a table, policy or RPC changes what is
 * stored or who can see it, this text must change in the same commit.
 */
export function privacyPolicy(): LegalDocument {
  return {
    title: 'Privacy policy',
    summary:
      'Drop In helps you find pickup games near you. This policy explains what we collect, who can see it, and how to delete it.',
    lastUpdated: LEGAL.lastUpdated,
    sections: [
      {
        id: 'who',
        heading: 'Who we are',
        blocks: [
          p(
            `Drop In is operated by ${LEGAL.operatorName}. To ask about your information, ${contactPhrase()}.`,
          ),
        ],
      },
      {
        id: 'account',
        heading: 'Your account',
        blocks: [
          p(
            'We store the email address you sign in with. If you use Sign in with Apple or Google, we receive the email address and account identifier that service shares with us — with Apple this can be a private relay address. We never receive your Apple or Google password.',
          ),
          p(
            'You choose a display name, which other players can see, and the sports you play, which stay private and set your default map filters.',
          ),
        ],
      },
      {
        id: 'location',
        heading: 'Location',
        blocks: [
          p(
            'With your permission, Drop In reads your device’s precise location while the app is open. We use it to:',
          ),
          list(
            'centre the map and find venues and sessions near you',
            'start the map at your location when you place a meeting spot or submit a venue',
            'confirm you are at a venue when you check in, and near a session when you share a photo from it',
          ),
          p(
            'We do not keep a history of where you have been. When you check in or share a session photo, your coordinates are compared with the venue or session location and then discarded; we store only whether the check passed and, for check-ins, the distance and reported accuracy. To list venues near you, the app sends the centre of the map on screen — at first, your location — to our servers for that search; we do not save it.',
          ),
          p(
            'Places you choose on purpose are stored: a session’s meeting spot is public, and a venue you submit is visible to you and our moderators until it is approved. Drop In never reads your location in the background. You can turn location off in your device settings; the live map, creating sessions and adding venues then stop working, and everything else keeps working.',
          ),
        ],
      },
      {
        id: 'content',
        heading: 'What you share, and who sees it',
        blocks: [
          list(
            'Sessions you organise — title, time and meeting spot — are public.',
            'Chat messages are visible to the people who joined that session.',
            'Posts, captions, photos and short clips are public, including to people without an account.',
            'While a check-in or “on my way” status is active, other signed-in players can see your display name, the venue, sport, party size and any note you add.',
            'Venue submissions are visible to you and our moderators until they are reviewed.',
          ),
        ],
      },
      {
        id: 'safety',
        heading: 'Reports and blocks',
        blocks: [
          p(
            'When you report something, our moderators see what you reported, a copy of it as it was when you reported it, the reason and any details you add. The player you report is not told who reported them. Your block list is private to you.',
          ),
        ],
      },
      {
        id: 'use',
        heading: 'How we use information',
        blocks: [
          p(
            'We use your information to run Drop In — to show nearby games, host sessions and chats, keep the community safe by reviewing reports and enforcing our terms, and to keep the service secure and working.',
          ),
          p(
            'Drop In has no ads. We do not sell your personal information, share it for advertising, or track you across other companies’ apps and websites.',
          ),
        ],
      },
      {
        id: 'providers',
        heading: 'Services we rely on',
        blocks: [
          list(
            `Supabase hosts our database, sign-in and file storage in ${LEGAL.dataRegion}. It processes technical information such as IP addresses and request logs to run and secure the service.`,
            'Mapbox provides the maps. Loading map tiles sends Mapbox your IP address and the area on screen. On iPhone and Android, Mapbox’s map software may also collect anonymous usage and location telemetry, which you can switch off from the map’s ⓘ button.',
            'Geoapify powers place search. It receives the text you search for, not your location.',
            'Apple and Google handle sign-in when you choose them.',
          ),
        ],
      },
      {
        id: 'retention',
        heading: 'Keeping and deleting your information',
        blocks: [
          p(
            `We keep your information while your account exists. You can delete your account at any time from Profile → Delete account in the app, or on the web at ${deletionPageAddress()}.`,
          ),
          p(
            'Deleting your account permanently removes your profile, check-ins, “on my way” statuses, chat messages, posts, photos and clips, and venue submissions. Sessions you organise are removed too, including other players’ messages and posts in them. Venues that were approved stay listed, because they are public places rather than your data. Reports you filed are kept without your identity so moderation records stay complete. Deleted data may remain in encrypted backups for a limited time before they are overwritten.',
          ),
        ],
      },
      {
        id: 'rights',
        heading: 'Your choices and rights',
        blocks: [
          p(
            `You can see and change your profile in the app at any time. You can ask us for a copy of your information, or ask us to correct or delete it — ${contactPhrase()} and we will respond within 30 days. Depending on where you live, you may also be able to complain to your data protection authority.`,
          ),
        ],
      },
      {
        id: 'children',
        heading: 'Children',
        blocks: [
          p(
            `Drop In is not for anyone under ${LEGAL.minimumAge}. If we learn that someone under ${LEGAL.minimumAge} has an account, we will delete it.`,
          ),
        ],
      },
      {
        id: 'security',
        heading: 'Security',
        blocks: [
          p(
            'Information travels over encrypted connections, and the database only returns what each player is allowed to see. The app keeps your sign-in session in your device’s secure storage (on the web, in your browser’s storage). No system is perfectly secure, so please tell us if you find a problem.',
          ),
        ],
      },
      {
        id: 'changes',
        heading: 'Changes to this policy',
        blocks: [
          p(
            'We will update this page and its date when this policy changes, and let you know before a significant change to how we use information you have already shared takes effect.',
          ),
        ],
      },
    ],
  };
}

/**
 * The terms of use, including the community guidelines. App Store Review
 * Guideline 1.2 expects terms that rule out objectionable content and abusive
 * users; the "Community guidelines" section is that commitment.
 */
export function termsOfUse(): LegalDocument {
  return {
    title: 'Terms of use',
    summary:
      'The rules for using Drop In, including the community guidelines that keep games welcoming and safe.',
    lastUpdated: LEGAL.lastUpdated,
    sections: [
      {
        id: 'agreement',
        heading: 'Agreeing to these terms',
        blocks: [
          p(
            `Drop In is provided by ${LEGAL.operatorName}. By creating an account or using Drop In you agree to these terms, including the community guidelines below. If you do not agree, please do not use Drop In. The terms of the app store you downloaded Drop In from also apply.`,
          ),
        ],
      },
      {
        id: 'eligibility',
        heading: 'Who can use Drop In',
        blocks: [
          p(
            `You must be at least ${LEGAL.minimumAge} years old. Use one account, in your own name or a nickname that does not impersonate anyone, and keep access to your email and sign-in accounts secure — you are responsible for what happens on your account.`,
          ),
        ],
      },
      {
        id: 'guidelines',
        heading: 'Community guidelines',
        blocks: [
          p(
            'Drop In has zero tolerance for objectionable content and abusive behaviour. Do not post, send or organise anything that:',
          ),
          list(
            'harasses, bullies, threatens or intimidates anyone',
            'attacks people for their race, ethnicity, nationality, religion, disability, sex, gender identity, sexual orientation or age',
            'is sexual or nude, or sexualises anyone — content involving a minor is reported to the authorities',
            'promotes violence, self-harm or dangerous activity',
            'involves illegal activity, including drugs and weapons',
            'is spam, a scam or unsolicited advertising',
            'impersonates someone or shares another person’s private information',
            'you do not have the right to share',
            'misleads other players, such as fake check-ins or sessions you do not intend to hold',
          ),
          p('Be a good teammate: show up when you say you will, play fair and respect the venue.'),
        ],
      },
      {
        id: 'enforcement',
        heading: 'Reporting and enforcement',
        blocks: [
          p(
            `You can report any post, message, session or profile, and block any player, from within the app. Our moderators aim to review reports ${LEGAL.reportReviewTarget}. We may remove content, reset display names, cancel sessions, and suspend or close accounts that break these terms, without notice where safety requires it.`,
          ),
        ],
      },
      {
        id: 'content',
        heading: 'Your content',
        blocks: [
          p(
            'You own what you post. You give us a worldwide, non-exclusive, royalty-free licence to store, display and share it within Drop In so we can run the service, for as long as it stays on Drop In. Public content can be seen by anyone, including people without an account.',
          ),
        ],
      },
      {
        id: 'safety',
        heading: 'Playing safely',
        blocks: [
          p(
            'Drop In helps people find each other to play. We do not organise, supervise or insure games, and we do not check the identity of players. Venue details come from players and moderators and can be out of date. Meet in public places, check conditions before you travel, follow the venue’s rules, and only play at a level that is safe for you. You take part at your own risk.',
          ),
          p('If anyone is in immediate danger, call 911 or your local emergency number.'),
        ],
      },
      {
        id: 'availability',
        heading: 'The service',
        blocks: [
          p(
            'We work to keep Drop In available and accurate, but it is provided “as is” and may change, pause or stop. To the extent the law allows, we disclaim warranties and are not liable for indirect or consequential losses, or for what players do on or off Drop In. Nothing in these terms limits rights you have under consumer law that cannot be limited.',
          ),
        ],
      },
      {
        id: 'ending',
        heading: 'Ending your use',
        blocks: [
          p(
            'You can stop using Drop In and delete your account at any time from Profile. We may suspend or close accounts that break these terms.',
          ),
        ],
      },
      {
        id: 'changes',
        heading: 'Changes and governing law',
        blocks: [
          p(
            `We will update these terms and their date when they change, and let you know before a significant change takes effect. These terms are governed by ${LEGAL.governingLaw}.`,
          ),
          p(`Questions? ${capitalise(contactPhrase())}.`),
        ],
      },
    ],
  };
}

function capitalise(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
