# frozen_string_literal: true
#
# The store the BrotherPOS training videos are filmed in. Run with rails runner (seed.mjs
# does this): it deletes the store if it exists and builds it again, so every shoot
# starts from the same clean state — no sales, sessions or customers left over from the
# last take.
#
# Set up like the stores these videos are for, Indigenous cannabis stores: cannabis
# features on, no tax, and no compliance features (no ID check, no daily purchase limit,
# no SLGA reporting), so none of that appears on camera.
#
# Logins come from the environment (seed.mjs mints them and keeps them in .local/), so
# no password is written into this public repo:
#   TRAINING_PASSWORD, TRAINING_OWNER_PIN, TRAINING_MANAGER_PIN, TRAINING_CLERK_PIN
#   TRAINING_SUBDOMAIN (default "riverstone"), TRAINING_STORE_NAME
#   TRAINING_OPEN_DRAWER=1 to leave Register 1's drawer open (for clips that start mid-shift)
#   TRAINING_LOCALE (en/fr) for the back office's language

subdomain  = ENV.fetch("TRAINING_SUBDOMAIN", "riverstone")
store_name = ENV.fetch("TRAINING_STORE_NAME", "Riverstone Cannabis")
password   = ENV.fetch("TRAINING_PASSWORD")
pins       = {
  owner:   ENV.fetch("TRAINING_OWNER_PIN"),
  manager: ENV.fetch("TRAINING_MANAGER_PIN"),
  clerk:   ENV.fetch("TRAINING_CLERK_PIN"),
}

if (old = Store.find_by(subdomain: subdomain))
  old.update_columns(active: false)
  StorePurger.new(old).purge!
  puts "removed the old #{subdomain}"
end

store = Store.create!(
  store_name: store_name,
  subdomain: subdomain,
  store_type: "cannabis",
  tax_rate: 0.0,
  tax_name: "Tax",
  currency_symbol: "$",
  timezone: "America/Toronto",
  # The back office's language is the store's; the register's is set per device by the flow.
  locale: ENV.fetch("TRAINING_LOCALE", "en"),
  province: "ON",
  is_retailer: true,
  is_distributor: false,
  active: true,
  enable_age_verification: false,
  enforce_purchase_limit: false,
  slga_enabled: false,
  # Past the first-run setup wizard, unless a clip films the wizard itself.
  setup_wizard_completed_at: ENV["TRAINING_SETUP_WIZARD"] == "1" ? nil : Time.current,
  feature_flags: Store::INDUSTRY_DEFAULTS["cannabis"].merge(
    "enable_storefront" => false,
    "enable_online_ordering" => false,
    "enable_age_verification" => false,
    "enable_customers" => true,
    # Used by the time-clock and label clips; harmless for the rest.
    "enable_time_tracking" => true,
    "enable_label_printing" => true,
    "enable_receipt_printing" => ENV["TRAINING_RECEIPT_PRINTING"] == "1",
  ),
)
# Store#after_create normally provisions; make sure the defaults (categories, weight
# presets, Register 1, loyalty tiers) exist either way.
StoreProvisioner.new(store).provision! unless ActsAsTenant.with_tenant(store) { Register.exists? }

ActsAsTenant.with_tenant(store) do
  staff = {
    owner:   { first_name: "Morgan", last_name: "Hill",  role: "admin",   email: "owner@#{subdomain}.training" },
    manager: { first_name: "Sam",    last_name: "Brant", role: "manager", email: "manager@#{subdomain}.training" },
    clerk:   { first_name: "Riley",  last_name: "Cole",  role: "clerk",   email: "clerk@#{subdomain}.training" },
  }
  users = staff.to_h do |key, attrs|
    [key, User.create!(attrs.merge(store: store, password: password, password_confirmation: password, pin: pins[key]))]
  end

  load Rails.root.join("db/demo_starter_seed.rb")

  # Regulars to look up and sell to. Plain names, made-up numbers (555 exchange).
  [
    ["Jamie Morin",    "705-555-0142"],
    ["Chris Martin",   "705-555-0187"],
    ["Pat Lee",        "705-555-0113"],
    ["Dana Whitfield", "705-555-0164"],
    ["Alex Bouchard",  "705-555-0129"],
  ].each_with_index do |(name, phone), i|
    Customer.create!(name: name, phone: phone, loyalty_points: [120, 45, 300, 0, 80][i])
  end

  if ENV["TRAINING_OPEN_DRAWER"] == "1"
    CashDrawerSession.create!(
      register: Register.find_by!(identifier: "REG-001"),
      opened_by_id: users[:manager].id,
      opened_at: Time.current,
      opening_float: 200,
      expected_opening_float: 200,
      status: "open",
    )
  end

  puts "#{store_name} (#{subdomain}, store #{store.id}): " \
       "#{Product.where(deleted_at: nil).count} products, #{Customer.count} customers, " \
       "#{User.count} staff, tax #{store.tax_rate}%, drawer #{CashDrawerSession.where(status: 'open').exists? ? 'open' : 'closed'}"
end
