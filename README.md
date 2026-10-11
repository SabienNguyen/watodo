# watodo

**What to do, right now**

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;In theory, things like deep work, routines, and weekly planning
boost productivity, protect mental health, and reduce burnout. Now, for various reasons, these
lifestyles do not work for most people. People desire to create a routine that focuses on things
that they want to do, such as hobbies or passion projects. The issue with this mentality is that it
makes the mundane parts of your routine the enemy.

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;There is an urge to blame these things because parts of an
average person's routine might include work, school, traffic, and other things that people do not
consider the "fuel" for an exciting life. Moreover, systems that use schedules that revolve around
time blocks fall apart from a lack of adaptability. I propose a system that lives between the
impulsive actor and to-the-minute planning. This system encourages people to implement routines in
their lives centered around the mundane and repetitive parts of their schedules.

## The goal

Implement a system that allows you to commit to doing activities without a time-constrained routine.

- Build routines that match your current lifestyle
- Do the activities you want to do without burning out
- Organize your life without constraining it to strict schedules

## Hosting it yourself

watodo has no cloud service and no accounts. You run a small program, the hub, on a computer you
own. The hub serves the app and keeps your devices in sync. Each device also keeps its own copy of
your data, so the app still works when the hub is unreachable.

You need Node.js 22.18 or newer (it is developed on Node 26) and npm.

### 1. Run the hub

```sh
git clone https://github.com/SabienNguyen/watodo.git
cd watodo
npm install
npm run build
npm run hub
```

Open http://127.0.0.1:4780 in a browser on the same computer. The first visit walks you through
setting up a day.

The hub listens on this computer only. It has no login, so anyone who can reach it can read and
change your data. Keep it off the open internet.

| Setting | Default | What it is |
| --- | --- | --- |
| `WATODO_PORT` | `4780` | The port the hub listens on |
| `WATODO_DATA_DIR` | `~/.local/share/watodo` | Where the hub keeps its copy of your data, in `watodo.json` |
| `WATODO_STATIC_DIR` | `dist/` in this folder | The built app to serve |

### 2. Reach it from your phone

A phone can only install watodo to its home screen from an `https` address. The simplest way to get
one without opening your computer to the internet is [Tailscale](https://tailscale.com), a private
network between your own devices.

1. Install Tailscale on the computer and sign in.
2. In Tailscale's admin console, open the DNS page, turn on MagicDNS, and enable HTTPS certificates.
3. Share the hub on your private network:

   ```sh
   tailscale serve --bg 4780
   ```

4. Run `tailscale serve status` to see the address, which looks like
   `https://your-computer.your-tailnet.ts.net`.
5. Install Tailscale on the phone, sign in with the same account, and switch it on.
6. Open the address in the phone's browser and add it to the home screen. On an iPhone this must be
   Safari: tap Share, then Add to Home Screen.

Any other way of putting HTTPS in front of the hub works too, as long as it passes WebSocket
connections through on `/sync/watodo`.

### 3. Keep the hub running

`npm run hub` stops when you close the terminal. To start it at login on Linux with systemd, use
the template in `hub/watodo-hub.service`: replace `@NODE@` with the path to `node` and `@REPO@` with
the path to this folder, save it as `~/.config/systemd/user/watodo-hub.service`, then run:

```sh
systemctl --user daemon-reload
systemctl --user enable --now watodo-hub
```

### Guided setup

On Arch Linux, one script walks through steps 1 to 3 and the phone, showing each command and asking
before it runs anything:

```sh
npm run setup:devices
```

### Updating

```sh
git pull
npm install
npm run deploy   # rebuilds the app and restarts the hub service
```

If you start the hub by hand instead of as a service, run `npm run build` and restart it yourself.

Each device picks up the new version the next time it opens the app while the hub is reachable. On
a phone that can take closing and reopening the app once.

### Backing up

Your history is in `~/.local/share/watodo/watodo.json`. Copy that file somewhere safe from time to
time.

## Developing

```sh
npm run dev      # start the app with live reload, then open the address it prints
npm test         # run the tests
npm run build    # production build
```

Adding `?demo` to the address while running `npm run dev` shows a made-up month of history that is
never saved.

Built with TypeScript, React, Vite, Tailwind, shadcn/ui and TinyBase.
