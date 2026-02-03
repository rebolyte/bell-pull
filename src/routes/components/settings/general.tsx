import { FlashMessage } from "../flash.tsx";

type GeneralSettingsProps = {
  flash?: string;
};

export const GeneralSettings = ({ flash }: GeneralSettingsProps) => (
  <div class="settings-screen">
    <h2>General Settings</h2>
    <FlashMessage flash={flash} />
    <p class="placeholder-text">General settings coming soon</p>
  </div>
);
