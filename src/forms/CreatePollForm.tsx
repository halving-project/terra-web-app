import { AccAddress } from "@terra-money/terra.js"
import useNewContractMsg from "../terra/useNewContractMsg"
import Tooltip from "../lang/Tooltip.json"
import { MAX_MSG_LENGTH, MIR } from "../constants"
import { div, gt } from "../libs/math"
import { record, getLength } from "../libs/utils"
import { lookup } from "../libs/parse"
import useForm from "../libs/useForm"
import { validate as v, step, toBase64 } from "../libs/formHelpers"
import { renderBalance } from "../libs/formHelpers"
import { useRefetch, useContractsAddress, useContract } from "../hooks"
import { BalanceKey } from "../hooks/contractKeys"
import { GovKey, useGov } from "../graphql/useGov"
import { TooltipIcon } from "../components/Tooltip"
import { Type } from "../pages/Poll/CreatePoll"
import useGovReceipt from "./receipts/useGovReceipt"
import useSelectAsset, { Config } from "./useSelectAsset"
import FormContainer from "./FormContainer"
import FormGroup from "../components/FormGroup"
import FormCheck from "../components/FormCheck"

enum Key {
  /* poll */
  title = "title",
  description = "description",
  link = "link",

  /* asset */
  name = "name",
  symbol = "symbol",
  oracle = "oracle",

  /* params:whitelist */
  weight = "weight",
  lpCommission = "lpCommission",
  ownerCommission = "ownerCommission",
  auctionDiscount = "auctionDiscount",
  minCollateralRatio = "minCollateralRatio",

  /* params:parameter change */
  parameter = "parameter",
  asset = "asset",
}

enum Parameter {
  WEIGHT = "Weight",
  COMMISSION = "Commission",
  MINT = "Mint",
}

const CreatePollForm = ({ type, tab }: { type: Type; tab: Tab }) => {
  const balanceKey = BalanceKey.TOKEN
  const governance = useGov()

  const getFieldKeys = (parameter?: string) => {
    const paramsFieldKeys =
      {
        [Parameter.WEIGHT]: [Key.weight],
        [Parameter.COMMISSION]: [Key.lpCommission, Key.ownerCommission],
        [Parameter.MINT]: [Key.auctionDiscount, Key.minCollateralRatio],
      }[parameter as Parameter] ?? []

    return [
      Key.title,
      Key.description,
      Key.link,

      ...{
        [Type.WHITELIST]: [
          Key.name,
          Key.symbol,
          Key.oracle,

          Key.weight,
          Key.lpCommission,
          Key.ownerCommission,
          Key.auctionDiscount,
          Key.minCollateralRatio,
        ],
        [Type.PARAMS]: [Key.asset, Key.parameter, ...paramsFieldKeys],
      }[type],
    ]
  }

  /* context */
  const { contracts, whitelist, getToken } = useContractsAddress()
  const { result, find } = useContract()
  useRefetch([balanceKey])

  /* form:validate */
  const validate = ({ title, description, link, ...values }: Values<Key>) => {
    const { name, symbol, oracle, asset, parameter } = values
    const { auctionDiscount, minCollateralRatio } = values

    const range = { optional: type === Type.PARAMS, max: "100" }
    const ranges = {
      [Key.title]: { min: 4, max: 64 },
      [Key.description]: { min: 4, max: 64 },
      [Key.link]: { min: 12, max: 128 },
      [Key.name]: { min: 3, max: 50 },
      [Key.symbol]: { min: 3, max: 12 },
    }

    return record(
      {
        [Key.title]:
          v.required(title) || v.length(title, ranges[Key.title], "Title"),
        [Key.description]:
          v.required(description) ||
          v.length(description, ranges[Key.description], "Description"),
        [Key.link]: link
          ? v.length(link, ranges[Key.link], "Link") || v.url(link)
          : "",

        [Key.name]:
          v.required(name) || v.length(name, ranges[Key.name], "Name"),
        [Key.symbol]:
          v.required(symbol) ||
          v.length(symbol, ranges[Key.symbol], "Symbol") ||
          v.symbol(symbol),
        [Key.asset]: v.required(asset),

        [Key.oracle]: v.address(oracle, [AccAddress.validate]),
        [Key.parameter]: v.required(parameter),

        [Key.weight]: "",
        [Key.lpCommission]: "",
        [Key.ownerCommission]: "",
        [Key.auctionDiscount]:
          parameter && auctionDiscount
            ? ""
            : v.amount(auctionDiscount, range, "Auction discount"),
        [Key.minCollateralRatio]:
          parameter && minCollateralRatio
            ? ""
            : v.amount(
                minCollateralRatio,
                { ...range, max: undefined },
                "Minimum collateral ratio"
              ),
      },
      "",
      getFieldKeys(parameter)
    )
  }

  /* form:hook */
  const defaultParams = {
    [Type.WHITELIST]: {
      [Key.auctionDiscount]: "20",
      [Key.minCollateralRatio]: "150",
    },
    [Type.PARAMS]: {
      [Key.parameter]: Parameter.MINT,
    },
  }[type]

  const initial = Object.assign(record(Key, ""), defaultParams)

  const form = useForm<Key>(initial, validate)
  const { values, setValue, handleChange, getFields, attrs, invalid } = form
  const { title, description, link } = values
  const { name, symbol, oracle, asset } = values
  const { weight, lpCommission, ownerCommission } = values
  const { auctionDiscount, minCollateralRatio } = values
  const amount = governance[GovKey.CONFIG]?.["proposal_deposit"] ?? "0"
  const value = lookup(amount, MIR)

  /* render:form */
  const config: Config = {
    token: asset,
    onSelect: (value) => setValue(Key.asset, value),
    skip: ["MIR"],
  }

  const select = useSelectAsset(config)

  const fields = {
    deposit: {
      help: renderBalance(find(balanceKey, getToken(MIR)), MIR),
      label: <TooltipIcon content={Tooltip.Gov.Deposit}>Deposit</TooltipIcon>,
      value,
      unit: MIR,
    },

    ...getFields({
      [Key.title]: {
        label: "Title",
        input: { placeholder: "", autoFocus: true },
      },
      [Key.description]: {
        label: "Description",
        textarea: {
          placeholder: "",
        },
      },
      [Key.link]: {
        label: "Information Link",
        input: { placeholder: "URL to asset detail" },
      },

      [Key.name]: {
        label: "Asset Name",
        input: { placeholder: "" },
      },
      [Key.symbol]: {
        label: "Symbol",
        input: { placeholder: "" },
      },
      [Key.asset]: {
        label: "Asset",
        select: select.button,
        assets: select.assets,
        focused: select.isOpen,
      },

      [Key.oracle]: {
        label: "Oracle Feeder",
        input: {
          placeholder: "Terra address of the oracle feeder",
        },
      },

      [Key.weight]: {
        label: <TooltipIcon content={Tooltip.Gov.Weight}>Weight</TooltipIcon>,
        input: { type: "number", step: step(), disabled: true },
        unit: "%",
      },
      [Key.lpCommission]: {
        label: (
          <TooltipIcon content={Tooltip.Gov.LPcommission}>
            LP Commission
          </TooltipIcon>
        ),
        input: { type: "number", step: step(), disabled: true },
        unit: "%",
      },
      [Key.ownerCommission]: {
        label: (
          <TooltipIcon content={Tooltip.Gov.OwnerCommission}>
            MIR Staking Commission
          </TooltipIcon>
        ),
        input: { type: "number", step: step(), disabled: true },
        unit: "%",
      },
      [Key.auctionDiscount]: {
        label: (
          <TooltipIcon content={Tooltip.Gov.AuctionDiscount}>
            Auction Discount
          </TooltipIcon>
        ),
        input: {
          type: "number",
          step: step(),
          placeholder: defaultParams[Key.auctionDiscount],
        },
        unit: "%",
      },
      [Key.minCollateralRatio]: {
        label: (
          <TooltipIcon content={Tooltip.Gov.MinimumCollateralRatio}>
            Minimum Collateral Ratio
          </TooltipIcon>
        ),
        input: {
          type: "number",
          step: step(),
          placeholder: defaultParams[Key.minCollateralRatio],
        },
        unit: "%",
      },
    }),
  }

  const radio = Object.entries(Parameter).map(([key, value]) => ({
    attrs: {
      type: "radio",
      id: key,
      name: Key.parameter,
      value,
      checked: value === values[Key.parameter],
      onChange: handleChange,
      disabled: value !== Parameter.MINT,
    },
    label: value,
  }))

  const fieldKeys = getFieldKeys(values[Key.parameter])

  /* submit */
  const newContractMsg = useNewContractMsg()
  const token = asset
  const { pair } = whitelist[token] ?? {}
  const { mirrorToken, mint, gov, factory } = contracts

  /* whitelist */
  const whitelistMessage = {
    name,
    symbol,
    oracle_feeder: oracle,
    params: {
      auction_discount: div(auctionDiscount, 100),
      min_collateral_ratio: div(minCollateralRatio, 100),
    },
  }

  /* parameter:inflation */
  const update_weight = {
    asset_token: token,
    weight: !weight ? undefined : div(weight, 100),
  }

  /* parameter:commission */
  const commissionPassCommand = {
    contract_addr: pair,
    msg: toBase64({
      update_config: {
        lp_commission: !lpCommission ? undefined : div(lpCommission, 100),
        owner_commission: !ownerCommission
          ? undefined
          : div(ownerCommission, 100),
      },
    }),
  }

  /* parameter:mint */
  const mintPassCommand = {
    contract_addr: mint,
    msg: toBase64({
      update_asset: {
        asset_token: token,
        auction_discount: !auctionDiscount
          ? undefined
          : div(auctionDiscount, 100),
        min_collateral_ratio: !minCollateralRatio
          ? undefined
          : div(minCollateralRatio, 100),
      },
    }),
  }

  const message = {
    [Type.WHITELIST]: { whitelist: whitelistMessage },
    [Type.PARAMS]:
      {
        [Parameter.WEIGHT]: { update_weight },
        [Parameter.COMMISSION]: { pass_command: commissionPassCommand },
        [Parameter.MINT]: { pass_command: mintPassCommand },
      }[values[Key.parameter] as Parameter] ?? {},
  }[type]

  const execute_msg = { contract: factory, msg: toBase64(message) }
  const msg = toBase64({
    create_poll: { title, description, link, execute_msg },
  })

  const data = [
    newContractMsg(mirrorToken, { send: { amount, contract: gov, msg } }),
  ]

  const loading =
    result[balanceKey].loading || governance.result[GovKey.CONFIG].loading

  const messages =
    !loading && !gt(find(balanceKey, getToken(MIR)), amount)
      ? ["Insufficient balance"]
      : getLength(msg) > MAX_MSG_LENGTH
      ? ["Input is too long to be executed"]
      : undefined

  const disabled = invalid || loading || !!messages?.length

  /* result */
  const parseTx = useGovReceipt()

  const container = { tab, attrs, contents: [], messages, disabled, data }

  return (
    <FormContainer {...container} parseTx={parseTx} gov>
      {fieldKeys.map((key) =>
        key === Key.parameter
          ? radio.filter(({ attrs }) => !attrs.disabled).length > 1 && (
              <FormCheck horizontal label="Parameter" list={radio} key={key} />
            )
          : !fields[key].input?.disabled && (
              <FormGroup {...fields[key]} type={2} key={key} />
            )
      )}

      <FormGroup {...fields["deposit"]} type={2} />
    </FormContainer>
  )
}

export default CreatePollForm
