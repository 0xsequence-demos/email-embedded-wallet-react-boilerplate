import { Address } from "viem";
import { sequence } from "../config";

function getPlayFabQueryParam(): string | null {
  const params = new URLSearchParams(window.location.search);
  // Query Param to login with playfab
  return params.get("playfab");
}

export const PlayFabLogin = ({ setWalletAddress } : { setWalletAddress: (value: Address) => void }) => {
  async function LoginWithPlayfab() {
    const param = getPlayFabQueryParam();
    if (!param) {
      alert("No playfab param");
      return;
    }

    const response = await sequence.signIn(
      {
        playFabTitleId: import.meta.env.VITE_PLAYFAB_TITLE_ID,
        playFabSessionTicket: param,
      },
      "playfab session"
    );
    console.log(response);
    setWalletAddress(response.wallet as Address);
  }

  return <button onClick={LoginWithPlayfab}>Login with playfab Via Query Param: playfab=</button>;
};
