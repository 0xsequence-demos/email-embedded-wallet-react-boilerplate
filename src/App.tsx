import { useState, useEffect, useRef } from "react";
import "./App.css";
import { sequence } from "./config.ts";
import { PlayFabLogin } from "./components/PlayFabLogin.tsx";
import { onRequestVerifyJWT } from "./utils/helpers.ts";
import { LinkedWallet, useOpenConnectModal } from "@0xsequence/connect";
import {
  useAccount,
  useConnections,
  useDisconnect,
  useSignMessage,
} from "wagmi";

import { SequenceAPIClient } from "@0xsequence/api";
import { Deferred } from "./utils/promise.ts";
import { useToast } from "./components/ToastProvider.tsx";

const api = new SequenceAPIClient("https://api.sequence.app");

type GetSignatureResult = {
  parentMessage: string;
  childMessage: string;
  parentSig: string;
  childSig: string;
};

function App() {
  const { disconnect } = useDisconnect();
  const { setOpenConnectModal } = useOpenConnectModal();

  const { signMessageAsync } = useSignMessage();
  const connections = useConnections();
  const [awaitingEmailCodeInput, setAwaitingEmailCodeInput] = useState(false);
  const [walletAddress, setWalletAddress] = useState<any>("");
  const [email, setEmail] = useState<any>("");
  const [otpAnswer, setOtpAnswer] = useState<any>("");
  const [respondWithCode, setRespondWithCode] = useState<
    ((code: string) => Promise<void>) | null
  >();
  const [parentWalletAddress, setParentWalletAddress] = useState<
    string | undefined
  >(undefined);
  const [childWalletAddress, setChildWalletAddress] = useState<
    string | undefined
  >(undefined);

  const [linkedWallets, setLinkedWallets] = useState<LinkedWallet[]>([]);
  const { address: connectedWalletToLink } = useAccount();
  const [isLinkInProgress, setIsLinkInProgress] = useState(false);

  const [walletToUnlink, setWalletToUnlink] = useState<string | undefined>(
    undefined
  );
  const deferredPromiseRef = useRef<Deferred<GetSignatureResult> | null>(null);
  const parentWalletMessage = "child wallet with address ";
  const childWalletMessage = "parent wallet with address ";

  const [isFetchingLinkedWallets, setIsFetchingLinkedWallets] =
    useState<boolean>(false);

  // Only used for sequence universal wallet
  const [askForSignature, setAskForSignature] = useState<
    "linking" | "unlinking" | undefined
  >(undefined);

  const [askSignatureResult, setAskSignatureResult] = useState<
    GetSignatureResult | undefined
  >();
  const toast = useToast();
  useEffect(() => {
    console.log(isLinkInProgress, childWalletAddress);
    if (isLinkInProgress && childWalletAddress) {
      handleLink();
    }
  }, [isLinkInProgress, childWalletAddress]);

  useEffect(() => {
    if (walletToUnlink) {
      handleUnlink();
    }
  }, [walletToUnlink]);

  const checkAccounts = async () => {
    try {
      const isSignedIn = await sequence.isSignedIn();
      if (isSignedIn) {
        const address = await sequence.getAddress();
        if (address) {
          setParentWalletAddress(address);
        }
      } else {
        setParentWalletAddress(undefined);
      }
    } catch (error) {
      console.error(error);
    }

    if (connectedWalletToLink) {
      setChildWalletAddress(connectedWalletToLink);
    }
  };

  useEffect(() => {
    checkAccounts();
  }, []);

  useEffect(() => {
    if (askSignatureResult) {
      deferredPromiseRef.current?.resolve(askSignatureResult);
      setAskSignatureResult(undefined);
      setAskForSignature(undefined);
      deferredPromiseRef.current = null;
    }
  }, [askSignatureResult]);

  const signIn = async () => {
    setAwaitingEmailCodeInput(true);
    setEmail("");

    if (!awaitingEmailCodeInput) {
      const emailResponse = await sequence.signIn({ email }, "Email Waas Auth");
      console.log(emailResponse);
      setWalletAddress(emailResponse.wallet);
      setParentWalletAddress(emailResponse.wallet);
    }
  };

  const setEmailInput = (input: any) => {
    if (!awaitingEmailCodeInput) {
      setEmail(input);
    } else {
      setOtpAnswer(input);
    }
  };

  const askUserForSignature = async (
    messageFor: "linking" | "unlinking"
  ): Promise<GetSignatureResult> => {
    const deferred = new Deferred<GetSignatureResult>();

    deferredPromiseRef.current = deferred;

    setAskForSignature(messageFor);

    return deferred.promise;
  };

  const getSignatures = async (
    messageFor: "linking" | "unlinking"
  ): Promise<GetSignatureResult> => {
    let parentMessage: string;
    let parentSig: string | undefined;
    let childMessage: string | undefined;
    let childSig: string | undefined;

    if (messageFor === "linking") {
      parentMessage = parentWalletMessage + childWalletAddress;
      childMessage = "Link to " + childWalletMessage + parentWalletAddress;

      try {
        // adding a small delay to make sure the wallet is connected
        await new Promise((resolve) => setTimeout(resolve, 500));

        const response = await signMessageAsync({
          message: childMessage,
        });
        // @ts-ignore
        if (response.result) {
          // @ts-ignore
          childSig = response.result as string;
        } else {
          childSig = response;
        }

        const parentSigRes = await sequence.signMessage({
          message: parentMessage,
        });
        console.log(parentSigRes);
        parentSig = parentSigRes.data.signature;
      } catch (error) {
        toast({
          title: "Request rejected",
          description:
            "Please confirm signature the request in your wallet to continue.",
          variant: "error",
        });
        throw new Error("Could not get signature from wallet to be linked");
      }
    } else {
      try {
        parentMessage = parentWalletMessage + walletToUnlink;
        console.log("walletToUnlink", walletToUnlink);
        const parentSigRes = await sequence.signMessage({
          message: parentMessage,
        });
        parentSig = parentSigRes.data.signature;
      } catch (error) {
        toast({
          title: "Request rejected",
          description:
            "Please confirm signature the request in your wallet to continue.",
          variant: "error",
        });
        throw new Error("Could not get signature from wallet to be linked");
      }
    }

    return {
      parentMessage,
      childMessage: childMessage ?? "",
      parentSig,
      childSig: childSig ?? "",
    };
  };

  const handleDisconnect = async () => {
    return new Promise<void>((resolve) => {
      setChildWalletAddress(undefined);
      disconnect(undefined, {
        onSuccess: () => {
          resolve();
        },
      });
    });
  };
  const handleOnParentWalletDisconnectClick = async () => {
    setWalletAddress(null);
    setParentWalletAddress("");
    setAwaitingEmailCodeInput(false);
    setEmail(null);
    setWalletToUnlink(undefined);
    setIsLinkInProgress(false);
    setParentWalletAddress(undefined);
    setLinkedWallets([]);
    await sequence.dropSession();
  };

  const getLinkedWallets = async () => {
    setIsFetchingLinkedWallets(true);
    const message = "parent wallet with address " + parentWalletAddress;
    const signature = await sequence.signMessage({
      message: message,
    });
    if (!signature.data.signature) {
      console.error("Could not get signature from wallet to be linked");
      throw new Error("Could not get signature from wallet to be linked");
    }
    const response = await api.getLinkedWallets({
      parentWalletAddress: parentWalletAddress as `0x${string}`,
      parentWalletMessage: message,
      parentWalletSignature: signature.data.signature,
      signatureChainId: "137",
    });

    setLinkedWallets(response.linkedWallets);
    setIsFetchingLinkedWallets(false);
  };

  useEffect(() => {
    sequence.onEmailAuthCodeRequired(async (respondWithCode) => {
      setRespondWithCode(() => respondWithCode);
    });
  }, [otpAnswer, setRespondWithCode]);

  useEffect(() => {
    setTimeout(async () => {
      if (
        Number.isInteger(Number(otpAnswer)) &&
        respondWithCode &&
        otpAnswer.length == 6
      ) {
        console.log(otpAnswer);
        try {
          await respondWithCode(otpAnswer!);
        } catch (err) {
          console.log(err);
        }
      }
    });
  }, [otpAnswer]);

  useEffect(() => {
    if (connectedWalletToLink && !childWalletAddress) {
      setChildWalletAddress(connectedWalletToLink);
    }
  }, [connectedWalletToLink]);

  useEffect(() => {
    if (parentWalletAddress) {
      getLinkedWallets();
    }
  }, [parentWalletAddress]);

  async function callVerifyToken() {
    try {
      const { idToken } = await sequence.getIdToken();
      const res = await onRequestVerifyJWT({
        sequenceToken: idToken,
      });
      const resjson = await res.json();

      console.log(resjson);
    } catch (error) {
      console.error(error);
    }
  }

  // To link the wallets, their chainId should be 137
  const handleLink = async () => {
    if (!parentWalletAddress) {
      console.error("Parent wallet address not set");
      throw new Error("Parent wallet address not set");
    }
    if (!childWalletAddress) {
      console.error("Child wallet address not set");
      throw new Error("Child wallet address not set");
    }

    if (
      linkedWallets.some(
        (linked) =>
          linked.linkedWalletAddress === childWalletAddress.toLocaleLowerCase()
      )
    ) {
      setIsLinkInProgress(false);
      toast({
        title: "Wallet already linked",
        description: "The connected wallet is already linked.",
        variant: "normal",
      });
      return;
    }

    const isSequenceUniversalWallet =
      connections[0]?.connector.id === "sequence";

    const connectorName = connections[0]?.connector.name;

    try {
      let getSigResult: GetSignatureResult;

      if (isSequenceUniversalWallet) {
        getSigResult = await askUserForSignature("linking");
      } else {
        getSigResult = await getSignatures("linking");
      }

      if (!getSigResult) {
        console.error("Could not get signature from wallet to be linked");
        throw new Error("Could not get signature from wallet to be linked");
      }

      const { parentMessage, childMessage, parentSig, childSig } = getSigResult;

      await api.linkWallet({
        signatureChainId: "137",
        linkedWalletType: connectorName,
        parentWalletAddress,
        parentWalletMessage: parentMessage,
        parentWalletSignature: parentSig,
        linkedWalletAddress: childWalletAddress,
        linkedWalletMessage: childMessage,
        linkedWalletSignature: childSig,
      });

      await getLinkedWallets();

      toast({
        title: "Linking successful",
        description: "The wallet has been linked successfully.",
        variant: "success",
      });
    } catch (error) {
      console.error(error);
    } finally {
      setIsLinkInProgress(false);
    }
  };

  const handleUnlink = async () => {
    if (!parentWalletAddress) {
      console.error("Parent wallet address not set.");
      throw new Error("Parent wallet address not set");
    }
    if (!walletToUnlink) {
      console.error("Child wallet address not set.");
      throw new Error("Child wallet address not set");
    }

    try {
      const { parentMessage, parentSig } = await getSignatures("unlinking");

      const response = await api.removeLinkedWallet({
        signatureChainId: "137",
        parentWalletAddress,
        parentWalletMessage: parentMessage,
        parentWalletSignature: parentSig,
        linkedWalletAddress: walletToUnlink,
      });

      if (response.status) {
        const filtered = linkedWallets.filter(
          (linked) =>
            linked.linkedWalletAddress !== walletToUnlink.toLocaleLowerCase()
        );

        setLinkedWallets([...filtered]);
      }
      toast({
        title: "Unlinking successful",
        description: "The wallet has been unlinked successfully.",
        variant: "success",
      });
    } catch (error) {
      console.error(error);
    } finally {
      setWalletToUnlink(undefined);
    }
  };

  return (
    <>
      <h1>Email Embedded Wallet Auth</h1>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <PlayFabLogin
          setWalletAddress={(address) => {
            setWalletAddress(address);
            setParentWalletAddress(address);
          }}
        />

        {/* email / code input */}
        {!walletAddress && (
          <input
            value={awaitingEmailCodeInput ? otpAnswer : email!}
            onChange={(evt: any) => setEmailInput(evt.target.value!)}
            className="email-code"
            placeholder={!awaitingEmailCodeInput ? "email" : "email code"}
          ></input>
        )}

        {/* email / code button */}
        {!walletAddress && (
          <button onClick={() => signIn()}>
            {awaitingEmailCodeInput ? "input code" : "sign in"}
          </button>
        )}
      </div>

      {/* wallet address */}
      {walletAddress && (
        <span className={"wallet-address"}>{walletAddress}</span>
      )}

      {walletAddress && <button onClick={callVerifyToken}>Verify token</button>}

      {/* Link Wallet Button */}
      {walletAddress && (
        <button
          onClick={async () => {
            setWalletToUnlink(undefined);
            if (childWalletAddress) {
              await handleDisconnect();
            }
            setIsLinkInProgress(true);
            setOpenConnectModal(true);
          }}
        >
          {linkedWallets.length === 0 ? "Link a wallet" : "Link another wallet"}
        </button>
      )}

      {/* sign out button */}
      {walletAddress && (
        <button onClick={() => handleOnParentWalletDisconnectClick()}>
          {"sign out"}
        </button>
      )}

      {walletAddress && (
        <>
          {!isFetchingLinkedWallets && linkedWallets.length === 0 && (
            <div>No linked wallets</div>
          )}

          {linkedWallets.map((wallet, index) => (
            <div key={index}>
              <div>
                <div>
                  <div>{wallet.linkedWalletAddress}</div>
                  {/* <ClickToCopy
                    textToCopy={wallet.linkedWalletAddress}
                  /> */}
                </div>
                <div>
                  <div>Wallet type:</div>{" "}
                  <div>{wallet.walletType ?? "Unknown"}</div>
                </div>
                <div>
                  {childWalletAddress?.toLocaleLowerCase() ===
                    wallet.linkedWalletAddress && (
                    <div color="positive">Connected</div>
                  )}
                  <button
                    disabled={walletToUnlink !== undefined}
                    onClick={async () => {
                      setWalletToUnlink(wallet.linkedWalletAddress);
                    }}
                  >
                    {walletToUnlink === wallet.linkedWalletAddress
                      ? "Unlinking..."
                      : "Unlink"}
                  </button>
                </div>
              </div>
            </div>
          ))}

          {isLinkInProgress && !askForSignature && (
            <div>
              Connect your wallet and confirm the signature <br />
              request to link.
            </div>
          )}

          {isLinkInProgress && askForSignature && (
            <>
              <div>Confirm the signature request to link your wallet.</div>
              <button
                onClick={async () => {
                  const sigResult = await getSignatures("linking");
                  setAskSignatureResult(sigResult);
                }}
              >
                Confirm signature request
              </button>
            </>
          )}
        </>
      )}
    </>
  );
}

export default App;
