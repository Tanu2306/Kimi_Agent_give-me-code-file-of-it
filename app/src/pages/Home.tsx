import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileKey2,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

type PolicyResult = {
  allowed: boolean;
  errors: string[];
};

type ProductResult = {
  id: string;
  name: string;
  description: string;
  category: string;
  priceCents: number;
  currency: string;
  merchantId: string;
  merchantName: string;
  condition: "new" | "refurbished" | "used";
  approvedMerchant: boolean;
  available: boolean;
  imageUrl: string | null;
  policy: PolicyResult;
};

type MandateRecord = {
  id: string;
  originalRequest: string;
  category: string;
  maxBudgetCents: number;
  currency: string;
  condition: string;
  merchantPolicy: string;
  productId: string;
  merchantId: string;
  amountCents: number;
  status: string;
  integrityHash: string;
  expiresAt: Date;
  approvedAt: Date | null;
};

type TransactionRecord = {
  id: number;
  mandateId: string;
  paypalOrderId: string | null;
  captureId: string | null;
  amountCents: number;
  currency: string;
  status: string;
  duplicateAttempt: boolean;
  failureReason: string | null;
};

const securityScenarios = [
  ["budget-manipulation", "Budget manipulation"],
  ["unapproved-merchant", "Unapproved merchant"],
  ["product-substitution", "Product substitution"],
  ["duplicate-payment", "Duplicate payment"],
  ["expired-authorization", "Expired authorization"],
  ["webhook-forgery", "Webhook forgery"],
] as const;

function money(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

function shortHash(hash: string) {
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

export default function Home() {
  const utils = trpc.useUtils();
  const dashboard = trpc.intentlock.dashboard.useQuery(undefined, {
    refetchInterval: 5000,
  });
  const interpret = trpc.intentlock.interpret.useMutation();
  const createMandate = trpc.intentlock.createMandate.useMutation();
  const approveMandate = trpc.intentlock.approveMandate.useMutation();
  const createOrder = trpc.intentlock.createOrder.useMutation();
  const captureOrder = trpc.intentlock.captureOrder.useMutation();
  const runScenario = trpc.intentlock.runSecurityScenario.useMutation();

  const [message, setMessage] = useState("Find a wireless keyboard under $40, new only, from approved merchants.");
  const [activeMandate, setActiveMandate] = useState<MandateRecord | null>(null);
  const [activeTransaction, setActiveTransaction] = useState<TransactionRecord | null>(null);
  const [securityResult, setSecurityResult] = useState<unknown>(null);
  const [notice, setNotice] = useState<string>("");

  const metrics = dashboard.data?.metrics;
  const products = interpret.data?.products ?? [];
  const latestAudit = dashboard.data?.auditEvents?.slice(0, 8) ?? [];
  const latestTransactions = dashboard.data?.transactions?.slice(0, 8) ?? [];

  const lifecycleStep = useMemo(() => {
    if (activeTransaction?.status === "CAPTURED") return 3;
    if (activeMandate?.status === "APPROVED" || activeTransaction) return 2;
    if (activeMandate) return 1;
    return 0;
  }, [activeMandate, activeTransaction]);

  async function refreshDashboard() {
    await utils.intentlock.dashboard.invalidate();
  }

  function handleInterpret() {
    setNotice("");
    setActiveMandate(null);
    setActiveTransaction(null);
    interpret.mutate({ message });
  }

  function handleCreateMandate(product: ProductResult) {
    setNotice("");
    createMandate.mutate(
      { message, productId: product.id },
      {
        onSuccess: async (result) => {
          setActiveMandate(result.mandate as MandateRecord);
          setActiveTransaction(null);
          setNotice(result.policy.allowed ? "Mandate created. Review the exact purchase before approval." : "Mandate blocked by the Spending Constitution.");
          await refreshDashboard();
        },
      },
    );
  }

  function handleApprove() {
    if (!activeMandate) return;
    approveMandate.mutate(
      { mandateId: activeMandate.id },
      {
        onSuccess: async (result) => {
          setActiveMandate(result.mandate as MandateRecord);
          setNotice(result.approved ? "Exact purchase approved. PayPal sandbox order can now be created." : result.errors.join(", "));
          await refreshDashboard();
        },
      },
    );
  }

  function handleCreateOrder() {
    if (!activeMandate) return;
    createOrder.mutate(
      { mandateId: activeMandate.id },
      {
        onSuccess: async (result) => {
          setActiveTransaction(result.transaction as TransactionRecord);
          setNotice("Simulated PayPal sandbox order created.");
          await refreshDashboard();
        },
        onError: (error) => setNotice(error.message),
      },
    );
  }

  function handleCapture() {
    if (!activeMandate || !activeTransaction?.paypalOrderId) return;
    captureOrder.mutate(
      { mandateId: activeMandate.id, paypalOrderId: activeTransaction.paypalOrderId },
      {
        onSuccess: async (result) => {
          setActiveTransaction(result.transaction as TransactionRecord);
          setNotice(result.captured ? "Payment captured and recorded in the Intent Ledger." : result.errors.join(", "));
          await refreshDashboard();
        },
        onError: (error) => setNotice(error.message),
      },
    );
  }

  function handleScenario(scenario: (typeof securityScenarios)[number][0]) {
    setSecurityResult(null);
    runScenario.mutate(
      { scenario },
      {
        onSuccess: async (result) => {
          setSecurityResult(result);
          setNotice("Security scenario executed. The expected response is recorded in the audit ledger.");
          await refreshDashboard();
        },
      },
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f7f9] text-[#12141f]">
      <header className="sticky top-0 z-40 border-b border-[#12141f]/10 bg-[#f6f7f9]/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <a href="#top" className="flex items-center gap-3 font-mono text-sm font-semibold tracking-[0.2em]">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#12141f] text-[#25e4d1]">
              <Lock className="h-4 w-4" aria-hidden="true" />
            </span>
            INTENTLOCK
          </a>
          <nav className="hidden items-center gap-1 rounded-full bg-[#12141f] p-1 text-sm text-white md:flex">
            <a className="rounded-full px-4 py-2 transition hover:bg-white/10" href="#agent">Agent</a>
            <a className="rounded-full px-4 py-2 transition hover:bg-white/10" href="#security">Security Lab</a>
            <a className="rounded-full px-4 py-2 transition hover:bg-white/10" href="#ledger">Intent Ledger</a>
          </nav>
          <Button asChild className="rounded-full bg-[#12141f] text-white hover:bg-[#1d2130]">
            <a href="#agent">Run demo</a>
          </Button>
        </div>
      </header>

      <main id="top" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="grid gap-8 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div>
            <Badge className="mb-4 rounded-full bg-[#25e4d1]/15 px-3 py-1 text-[#12141f] hover:bg-[#25e4d1]/15">
              Trust & Authorization Layer for AI Commerce
            </Badge>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">
              Let AI decide what to buy. Let users decide what AI is allowed to spend.
            </h1>
          </div>
          <Card className="border-[#12141f]/10 bg-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldCheck className="h-5 w-5 text-[#0f8f84]" aria-hidden="true" />
                Purchase lifecycle
              </CardTitle>
              <CardDescription>
                AI recommendation, human authorization, and PayPal execution remain separate.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {[
                [1, "AI decision", "Product selected and validated"],
                [2, "User authorization", "Exact purchase approved"],
                [3, "PayPal execution", "Payment captured and audited"],
              ].map(([step, title, body]) => (
                <div key={step} className="flex items-center gap-3">
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-full border font-mono text-sm ${
                      lifecycleStep >= Number(step)
                        ? "border-[#12141f] bg-[#12141f] text-[#25e4d1]"
                        : "border-[#12141f]/15 bg-white text-[#12141f]/50"
                    }`}
                  >
                    {step}
                  </span>
                  <div>
                    <p className="font-medium">{title}</p>
                    <p className="text-sm text-[#12141f]/60">{body}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 py-4 sm:grid-cols-2 lg:grid-cols-4">
          {([
            { label: "Total mandates", value: metrics?.totalMandates ?? 0, Icon: FileKey2 },
            { label: "Pending approvals", value: metrics?.pendingApprovals ?? 0, Icon: Clock3 },
            { label: "Blocked attempts", value: metrics?.blockedAttempts ?? 0, Icon: AlertTriangle },
            { label: "Completed payments", value: metrics?.completedPayments ?? 0, Icon: CheckCircle2 },
          ]).map(({ label, value, Icon }) => (
            <Card key={label} className="border-[#12141f]/10 bg-white">
              <CardContent className="flex items-center justify-between pt-6">
                <div>
                  <p className="text-sm text-[#12141f]/60">{label}</p>
                  <p className="mt-2 font-mono text-3xl font-semibold">{value}</p>
                </div>
                <Icon className="h-5 w-5 text-[#0f8f84]" aria-hidden="true" />
              </CardContent>
            </Card>
          ))}
        </section>

        <section id="agent" className="grid gap-6 py-6 lg:grid-cols-[1fr_420px]">
          <div className="space-y-6">
            <Card className="border-[#12141f]/10 bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-[#0f8f84]" aria-hidden="true" />
                  AI Shopping Agent
                </CardTitle>
                <CardDescription>
                  Enter a purchase instruction. The backend converts it into structured spending rules.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  className="min-h-28 border-[#12141f]/15 bg-[#f6f7f9] text-base"
                />
                <div className="flex flex-wrap gap-3">
                  <Button onClick={handleInterpret} disabled={interpret.isPending} className="rounded-full bg-[#12141f] text-white hover:bg-[#1d2130]">
                    {interpret.isPending ? "Interpreting…" : "Interpret request"}
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-full border-[#12141f]/15"
                    onClick={() => setMessage("Find a wireless mouse under $30, new condition, from an approved seller.")}
                  >
                    Use mouse example
                  </Button>
                </div>
                {interpret.data ? (
                  <div className="rounded-lg border border-[#12141f]/10 bg-[#12141f] p-4 font-mono text-sm text-white">
                    <p className="mb-2 text-[#25e4d1]">Structured intent</p>
                    <pre className="overflow-x-auto whitespace-pre-wrap">{JSON.stringify(interpret.data.intent, null, 2)}</pre>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              {products.map((product) => (
                <Card key={product.id} className="border-[#12141f]/10 bg-white">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">{product.name}</CardTitle>
                        <CardDescription>{product.description}</CardDescription>
                      </div>
                      <Badge variant={product.policy.allowed ? "secondary" : "destructive"} className="rounded-full">
                        {product.policy.allowed ? "Allowed" : "Blocked"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-end justify-between">
                      <p className="font-mono text-2xl font-semibold">{money(product.priceCents, product.currency)}</p>
                      <p className="text-sm text-[#12141f]/60">{product.merchantName}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge variant="outline" className="rounded-full">{product.condition}</Badge>
                      <Badge variant="outline" className="rounded-full">
                        {product.approvedMerchant ? "Approved merchant" : "Unapproved merchant"}
                      </Badge>
                    </div>
                    {!product.policy.allowed ? (
                      <p className="text-sm text-[#b42318]">{product.policy.errors.join(" · ")}</p>
                    ) : null}
                    <Button
                      className="w-full rounded-full bg-[#12141f] text-white hover:bg-[#1d2130]"
                      disabled={!product.policy.allowed || createMandate.isPending}
                      onClick={() => handleCreateMandate(product)}
                    >
                      Create purchase mandate
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <Card className="border-[#12141f]/10 bg-[#12141f] text-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileKey2 className="h-5 w-5 text-[#25e4d1]" aria-hidden="true" />
                  Spending Constitution
                </CardTitle>
                <CardDescription className="text-white/60">
                  Deterministic rules the AI cannot override.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 font-mono text-sm">
                <div className="flex justify-between gap-4"><span className="text-white/55">Budget enforcement</span><span>Server-side</span></div>
                <div className="flex justify-between gap-4"><span className="text-white/55">Merchant validation</span><span>Approved only</span></div>
                <div className="flex justify-between gap-4"><span className="text-white/55">Price integrity</span><span>Hash-bound</span></div>
                <div className="flex justify-between gap-4"><span className="text-white/55">Duplicate protection</span><span>Capture lock</span></div>
                <Separator className="bg-white/10" />
                <p className="text-white/60">
                  Never allow the model to decide whether money can move. It recommends; the policy engine authorizes.
                </p>
              </CardContent>
            </Card>

            <Card className="border-[#12141f]/10 bg-white">
              <CardHeader>
                <CardTitle>Purchase authorization</CardTitle>
                <CardDescription>Approval applies only to this exact transaction.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {activeMandate ? (
                  <div className="space-y-3">
                    <div className="rounded-lg bg-[#f6f7f9] p-4">
                      <p className="font-mono text-sm text-[#12141f]/60">{activeMandate.id}</p>
                      <p className="mt-2 text-2xl font-semibold">{money(activeMandate.amountCents, activeMandate.currency)}</p>
                      <p className="mt-1 text-sm text-[#12141f]/60">Product {activeMandate.productId} · Merchant {activeMandate.merchantId}</p>
                      <p className="mt-3 font-mono text-xs text-[#12141f]/50">Hash {shortHash(activeMandate.integrityHash)}</p>
                    </div>
                    <Badge variant={activeMandate.status === "APPROVED" ? "secondary" : activeMandate.status === "PENDING_APPROVAL" ? "outline" : "destructive"} className="rounded-full">
                      {activeMandate.status}
                    </Badge>
                    <div className="grid gap-2">
                      <Button onClick={handleApprove} disabled={approveMandate.isPending || activeMandate.status !== "PENDING_APPROVAL"} className="rounded-full bg-[#12141f] text-white hover:bg-[#1d2130]">
                        Approve exact purchase
                      </Button>
                      <Button onClick={handleCreateOrder} disabled={createOrder.isPending || activeMandate.status !== "APPROVED"} variant="outline" className="rounded-full border-[#12141f]/15">
                        Create PayPal sandbox order
                      </Button>
                      <Button onClick={handleCapture} disabled={captureOrder.isPending || !activeTransaction?.paypalOrderId || activeTransaction.status === "CAPTURED"} variant="outline" className="rounded-full border-[#12141f]/15">
                        Capture approved payment
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-[#12141f]/60">Create a mandate from an allowed product to begin authorization.</p>
                )}
                {activeTransaction ? (
                  <div className="rounded-lg border border-[#12141f]/10 p-4 font-mono text-sm">
                    <p>Order: {activeTransaction.paypalOrderId ?? "—"}</p>
                    <p>Capture: {activeTransaction.captureId ?? "—"}</p>
                    <p>Status: {activeTransaction.status}</p>
                  </div>
                ) : null}
                {notice ? <p className="text-sm text-[#0f8f84]">{notice}</p> : null}
              </CardContent>
            </Card>
          </div>
        </section>

        <section id="security" className="grid gap-6 py-6 lg:grid-cols-[0.9fr_1.1fr]">
          <Card className="border-[#12141f]/10 bg-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-[#b42318]" aria-hidden="true" />
                INTENTLOCK Security Lab
              </CardTitle>
              <CardDescription>Run attack simulations against the authorization layer.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {securityScenarios.map(([scenario, label]) => (
                <Button
                  key={scenario}
                  variant="outline"
                  className="h-auto justify-start rounded-lg border-[#12141f]/15 px-4 py-3 text-left"
                  disabled={runScenario.isPending}
                  onClick={() => handleScenario(scenario)}
                >
                  {label}
                </Button>
              ))}
            </CardContent>
          </Card>
          <Card className="border-[#12141f]/10 bg-[#12141f] text-white">
            <CardHeader>
              <CardTitle>Expected system response</CardTitle>
              <CardDescription className="text-white/60">
                Unauthorized purchases are blocked and auditable.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="max-h-96 overflow-auto rounded-lg bg-black/20 p-4 font-mono text-xs text-white/85">
                {securityResult ? JSON.stringify(securityResult, null, 2) : "Select a scenario to run the security demonstration."}
              </pre>
            </CardContent>
          </Card>
        </section>

        <section id="ledger" className="grid gap-6 py-6 lg:grid-cols-2">
          <Card className="border-[#12141f]/10 bg-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-[#0f8f84]" aria-hidden="true" />
                Transactions
              </CardTitle>
              <CardDescription>Sandbox payment records and duplicate attempts.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {latestTransactions.length ? latestTransactions.map((transaction) => (
                <div key={transaction.id} className="rounded-lg border border-[#12141f]/10 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-mono text-sm">{transaction.mandateId}</p>
                    <Badge variant={transaction.status === "CAPTURED" ? "secondary" : transaction.status === "BLOCKED" || transaction.status === "FAILED" ? "destructive" : "outline"} className="rounded-full">
                      {transaction.status}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-[#12141f]/60">
                    {money(transaction.amountCents, transaction.currency)} · {transaction.paypalOrderId ?? "No order"}
                  </p>
                  {transaction.failureReason ? <p className="mt-1 text-sm text-[#b42318]">{transaction.failureReason}</p> : null}
                </div>
              )) : <p className="text-sm text-[#12141f]/60">No transactions yet.</p>}
            </CardContent>
          </Card>

          <Card className="border-[#12141f]/10 bg-white">
            <CardHeader>
              <CardTitle>Audit timeline</CardTitle>
              <CardDescription>Verified intent and security events.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {latestAudit.length ? latestAudit.map((event) => (
                <div key={event.id} className="flex gap-3">
                  <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[#25e4d1]" />
                  <div>
                    <p className="font-mono text-sm">{event.eventType}</p>
                    <p className="text-sm text-[#12141f]/60">{event.mandateId ?? "System event"}</p>
                  </div>
                </div>
              )) : <p className="text-sm text-[#12141f]/60">No audit events yet.</p>}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
