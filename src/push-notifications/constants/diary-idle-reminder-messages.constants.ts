import { SupportedPushLang } from '../types/diary';

export type DiaryIdleReminderMessage = {
  title: string;
  body: string;
};

export const DIARY_IDLE_REMINDER_MESSAGES: Record<
  SupportedPushLang,
  DiaryIdleReminderMessage[]
> = {
  en: [
    {
      title: 'Your thoughts may need a little space',
      body: 'It’s been a few days since your last entry. Maybe it’s time to unload what’s been on your mind.',
    },
    {
      title: 'A quiet check-in might help',
      body: 'A lot can build up in a week. Take a moment to write down what’s been happening inside.',
    },
    {
      title: 'Your journal is still here',
      body: 'Even a few words can help you reconnect with yourself when you’re ready.',
    },
    {
      title: 'A small note can be enough',
      body: 'Your journal is waiting whenever you feel ready. Start with one thought, one feeling, or one sentence.',
    },
  ],

  uk: [
    {
      title: 'Твоїм думкам може знадобитися простір',
      body: 'Минуло кілька днів з останнього запису. Можливо, варто вигрузити те, що накопичилось у голові.',
    },
    {
      title: 'Тиха перевірка себе може допомогти',
      body: 'За тиждень всередині може накопичитися багато. Знайди хвилину, щоб записати, що з тобою відбувається.',
    },
    {
      title: 'Твій щоденник все ще тут',
      body: 'Навіть кілька слів можуть допомогти знову відчути зв’язок із собою, коли будеш готовий.',
    },
    {
      title: 'Іноді достатньо одного речення',
      body: 'Nemory поруч, коли ти будеш готовий. Почни з однієї думки, одного відчуття або одного речення.',
    },
  ],

  de: [
    {
      title: 'Deine Gedanken brauchen vielleicht etwas Raum',
      body: 'Es ist ein paar Tage her seit deinem letzten Eintrag. Vielleicht ist es Zeit, das loszulassen, was dir durch den Kopf geht.',
    },
    {
      title: 'Ein ruhiger Check-in kann helfen',
      body: 'In einer Woche kann sich viel ansammeln. Nimm dir einen Moment, um aufzuschreiben, was in dir vorgeht.',
    },
    {
      title: 'Dein Journal ist noch da',
      body: 'Schon ein paar Worte können helfen, wieder mehr Verbindung zu dir selbst zu spüren, wenn du bereit bist.',
    },
    {
      title: 'Eine kleine Notiz kann reichen',
      body: 'Dein Journal wartet auf dich, wenn du bereit bist. Beginne mit einem Gedanken, einem Gefühl oder einem Satz.',
    },
  ],

  pl: [
    {
      title: 'Twoje myśli mogą potrzebować przestrzeni',
      body: 'Minęło kilka dni od ostatniego wpisu. Może warto wyrzucić z głowy to, co się nagromadziło.',
    },
    {
      title: 'Spokojne sprawdzenie siebie może pomóc',
      body: 'Przez tydzień może zebrać się naprawdę dużo. Poświęć chwilę, aby zapisać, co dzieje się w Tobie.',
    },
    {
      title: 'Twój dziennik nadal tu jest',
      body: 'Nawet kilka słów może pomóc ponownie poczuć kontakt ze sobą, gdy będziesz gotowy.',
    },
    {
      title: 'Wystarczy nawet krótka notatka',
      body: 'Twój dziennik czeka, kiedy będziesz gotowy. Zacznij od jednej myśli, jednego uczucia albo jednego zdania.',
    },
  ],
};
