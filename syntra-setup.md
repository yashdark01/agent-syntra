How to enable syntra globally (One-time setup)

Choose whichever option you prefer:

Option 1: Add a global alias in your ~/.zshrc (Easiest & Most Reliable)

Run this single command in your terminal:
bash
echo 'alias syntra="/Users/yash/agent-syntra/apps/cli/dist/index.js"' >> ~/.zshrc && source ~/.zshrc


Option 2: Put it into /usr/local/bin (System standard)
bash
sudo ln -sf /Users/yash/agent-syntra/apps/cli/dist/index.js /usr/local/bin/syntra


Option 3: Configure pnpm's global bin directory
bash
pnpm setup
source ~/.zshrc
cd /Users/yash/agent-syntra/apps/cli && pnpm link --global


Test it:

Open any terminal window and just run:

bash
syntra

You will enter the Syntra agent session directly without pnpm!