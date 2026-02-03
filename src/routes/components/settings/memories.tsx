import { FlashMessage } from "../flash.tsx";

type MemoriesSettingsProps = {
  flash?: string;
};

export const MemoriesSettings = ({ flash }: MemoriesSettingsProps) => (
  <div class="settings-screen">
    <h2>Memories</h2>
    <FlashMessage flash={flash} />
    <p class="placeholder-text">Memory management coming soon</p>
  </div>
);
