import { FlashMessage } from "../flash.tsx";

type MessagesSettingsProps = {
  flash?: string;
};

export const MessagesSettings = ({ flash }: MessagesSettingsProps) => (
  <div class="settings-screen">
    <h2>Messages</h2>
    <FlashMessage flash={flash} />
    <p class="placeholder-text">Message history coming soon</p>
  </div>
);
