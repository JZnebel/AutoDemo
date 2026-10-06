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
#   TRAINING_GIFT_CARDS=1 / TRAINING_STORE_CREDIT=1 to switch on those payment types (the
#   store-credit one also gives Dana Whitfield $25 of credit to spend)
#   TRAINING_WEEK_OF_SALES=1 a week of sales in this store (without the second store)
#   TRAINING_SHIFTS=1 shift scheduling on, with this week's shifts for Riley and Sam
#   TRAINING_HOUSE_ACCOUNT=1 house accounts on; Pat Lee has a tab with two charges and a payment
#   TRAINING_STOREFRONT=1 a live storefront (config, theme, age gate) with reviews + abandoned carts on
#   TRAINING_AI=1 Big Brother on, with no monthly message cap
#   TRAINING_ONLINE_ORDERS=1 storefront + online ordering on (the register's online-order alerts)
#   TRAINING_SMART_RECEIVING=1 / TRAINING_CASH_FLOW=1 switch on Supplier Invoices / Financials
#   TRAINING_UOM=1 to switch on unit-of-measure levels (case/unit; the UoM clip)
#   TRAINING_SCALE=1 to switch on the scale features (the give-away report clip)
#   TRAINING_LOSS_PREVENTION=1 to switch on the Loss Prevention review queue (that clip)
#   TRAINING_SCAN_TO_RECEIVE=1 to switch on Scan to Receive (that clip)
#   TRAINING_MENU_BOARD=1 to switch on digital menu boards (the menu board clip)
#   TRAINING_BUNDLES=1 to switch on product bundles (the bundles clip)
#   TRAINING_PRODUCT_IMAGES=1 to switch on product photos (the product images clip)
#   TRAINING_TIMESHEETS=1 for a few days of clock-ins, one left open (time tracking admin clip)
#   TRAINING_DEALS=1 for a 20%-off Edibles sale and a free pre-roll over $50 (register deals clip)
#   TRAINING_SECOND_REGISTER=1 to add Register 2 (the drawer-takeover clip)
#   TRAINING_EMAIL_RECEIPTS=1 to let the register email receipts (the receipts clip)
#   TRAINING_CLERK_NO_VOID=1 to take Void Sales away from cashiers, so a void asks for a
#   manager's PIN (the manager-override clip)
#   TRAINING_WHOLESALE=1 also builds Northern Lights Wholesale (a distributor with its own admin,
#     owner@northernlights.training) with four wholesale products, and turns on wholesale
#     ordering here. =connected also pairs the two stores (the ordering/portal/invoice clips).
#   TRAINING_SECOND_STORE=1 to also build a second store Morgan owns, with a week of sales in
#   both (for the owner-portal clips: comparing stores, moving stock between them)

subdomain  = ENV.fetch("TRAINING_SUBDOMAIN", "riverstone")
store_name = ENV.fetch("TRAINING_STORE_NAME", "Riverstone Cannabis")
password   = ENV.fetch("TRAINING_PASSWORD")
pins       = {
  owner:   ENV.fetch("TRAINING_OWNER_PIN"),
  manager: ENV.fetch("TRAINING_MANAGER_PIN"),
  clerk:   ENV.fetch("TRAINING_CLERK_PIN"),
}

second_subdomain = "#{subdomain}-west"
# The wholesale clips' distributor: its own store and login. Worker copies get the worker's
# number (northernlights2), but those clips are worker 1 only, since the address is on screen.
wholesale_subdomain = "northernlights#{subdomain[/\d+\z/]}"
# Logins are unique per store, so every worker's copy (riverstone2, ...) uses the same
# addresses as riverstone: the signed-in email shows in the admin header, and a worker
# number there would be on camera.
mail = subdomain.sub(/\d+\z/, "")
[subdomain, second_subdomain, wholesale_subdomain].each do |sub|
  next unless (old = Store.find_by(subdomain: sub))
  old.update_columns(active: false)
  StorePurger.new(old).purge!
  puts "removed the old #{sub}"
end

# A week of everyday sales, so the owner dashboard has something to compare. Plain unit
# items only, a few a day, more on the weekend; `busier` scales one store up.
def seed_week_of_sales(user, busier: 1.0)
  products = Product.where(deleted_at: nil, unit_type: "unit", is_bundle: [false, nil], product_type: %w[simple variation])
                    .where("price > 0").to_a
  return if products.empty?
  # The starter catalog is small: lend each item stock for the week's sales, then put the
  # count back so the other clips show the usual numbers.
  original = products.to_h { |p| [p.id, p.current_stock] }
  products.each { |p| p.update_columns(current_stock: p.current_stock.to_f + 500) }
  session = CashDrawerSession.create!(register: Register.first, opened_by_id: user.id, opened_at: 8.days.ago,
                                      opening_float: 200, expected_opening_float: 200, status: "closed",
                                      closed_at: 1.day.ago, closed_by_id: user.id)
  rng = Random.new(42)
  (1..7).each do |days_ago|
    day = days_ago.days.ago.beginning_of_day + 11.hours
    count = ((day.saturday? || day.sunday? ? 9 : 6) * busier).round
    count.times do |i|
      picks = products.sample(1 + rng.rand(3), random: rng)
      cash = rng.rand < 0.6
      owed = picks.sum { |p| p.price.to_f }
      sale = Sale.create!(payment_method: cash ? "cash" : "debit", status: "completed", source: "pos",
                          user: user, cash_drawer_session: session,
                          amount_tendered: cash ? (owed / 20.0).ceil * 20 : owed,
                          sale_line_items_attributes: picks.map { |p| { product: p, quantity: 1, unit_price: p.price, line_total: p.price } })
      at = day + (i * 47).minutes
      sale.update_columns(created_at: at, completed_at: at, updated_at: at)
    end
  end
  products.each { |p| p.reload.update_columns(current_stock: original[p.id]) }
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
  payment_house_account_enabled: ENV["TRAINING_HOUSE_ACCOUNT"] == "1",
  # What a real store fills in on the General tab (the settings clips show it).
  store_phone: "705-555-0100",
  store_address: "12 Riverside Rd, Wasauksing ON",
  store_email: "hello@riverstone.example",
  business_hours: (0..6).to_h { |d| [d.to_s, { "open" => d.zero? ? "11:00" : "10:00", "close" => d.zero? ? "18:00" : "21:00", "closed" => false }] },
  slga_enabled: false,
  # Past the first-run setup wizard, unless a clip films the wizard itself.
  setup_wizard_completed_at: ENV["TRAINING_SETUP_WIZARD"] == "1" ? nil : Time.current,
  payment_gift_card_enabled: ENV["TRAINING_GIFT_CARDS"] == "1",
  payment_store_credit_enabled: ENV["TRAINING_STORE_CREDIT"] == "1",
  feature_flags: Store::INDUSTRY_DEFAULTS["cannabis"].merge(
    "enable_storefront" => ENV["TRAINING_ONLINE_ORDERS"] == "1" || ENV["TRAINING_STOREFRONT"] == "1",
    "enable_online_ordering" => ENV["TRAINING_ONLINE_ORDERS"] == "1" || ENV["TRAINING_STOREFRONT"] == "1",
    "enable_product_reviews" => ENV["TRAINING_STOREFRONT"] == "1",
    "enable_abandoned_cart_recovery" => ENV["TRAINING_STOREFRONT"] == "1",
    "enable_ai_assistant" => ENV["TRAINING_AI"] == "1",
    "enable_shift_scheduling" => ENV["TRAINING_SHIFTS"] == "1",
    "enable_age_verification" => false,
    "enable_customers" => true,
    # Used by the time-clock and label clips; harmless for the rest.
    "enable_time_tracking" => true,
    "enable_label_printing" => true,
    "enable_email_receipts" => ENV["TRAINING_EMAIL_RECEIPTS"] == "1",
    "enable_product_images" => ENV["TRAINING_PRODUCT_IMAGES"] == "1",
    "enable_bundles" => ENV["TRAINING_BUNDLES"] == "1",
    "enable_menu_board" => ENV["TRAINING_MENU_BOARD"] == "1",
    "enable_scan_to_receive" => ENV["TRAINING_SCAN_TO_RECEIVE"] == "1",
    "enable_loss_prevention" => ENV["TRAINING_LOSS_PREVENTION"] == "1",
    "enable_scale" => ENV["TRAINING_SCALE"] == "1",
    "enable_receipt_printing" => ENV["TRAINING_RECEIPT_PRINTING"] == "1",
    "enable_smart_receiving" => ENV["TRAINING_SMART_RECEIVING"] == "1",
    "enable_cash_flow_report" => ENV["TRAINING_CASH_FLOW"] == "1",
    "enable_uom_hierarchy" => ENV["TRAINING_UOM"] == "1",
  ),
)
# Store#after_create normally provisions; make sure the defaults (categories, weight
# presets, Register 1, loyalty tiers) exist either way.
StoreProvisioner.new(store).provision! unless ActsAsTenant.with_tenant(store) { Register.exists? }
if ENV["TRAINING_CLERK_NO_VOID"] == "1"
  perms = (store.role_permissions || {}).deep_dup
  perms["clerk"] = (perms["clerk"] || {}).merge("void_sales" => false)
  store.save_role_permissions!(perms)
end

ActsAsTenant.with_tenant(store) do
  staff = {
    owner:   { first_name: "Morgan", last_name: "Hill",  role: "admin",   email: "owner@#{mail}.training" },
    manager: { first_name: "Sam",    last_name: "Brant", role: "manager", email: "manager@#{mail}.training" },
    clerk:   { first_name: "Riley",  last_name: "Cole",  role: "clerk",   email: "clerk@#{mail}.training" },
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

  seed_week_of_sales(users[:manager], busier: 1.4) if ENV["TRAINING_SECOND_STORE"] == "1" || ENV["TRAINING_WEEK_OF_SALES"] == "1"

  if ENV["TRAINING_STOREFRONT"] == "1" || ENV["TRAINING_AI"] == "1"
    # The top storefront tier: no AI message cap, every storefront tool available.
    store.update_columns(storefront_tier: "pos")
  end

  if ENV["TRAINING_STOREFRONT"] == "1"
    cfg = store.storefront_config || store.create_storefront_config!
    hero_text = ENV.fetch("TRAINING_LOCALE", "en") == "fr" ? ["Commandez en ligne, ramassez en magasin", "Voir le menu"] : ["Order online, pick up in store", "Shop the menu"]
    cfg.update!(enabled: true, wizard_completed: true, theme: "cannabis-island", age_gate_enabled: true, age_gate_minimum_age: 19,
                hero: (cfg.hero || {}).merge("heading" => "Riverstone Cannabis", "subtext" => hero_text[0], "cta_text" => hero_text[1]))
  end

  if ENV["TRAINING_SHIFTS"] == "1"
    wk = Date.current.beginning_of_week
    (0..4).each { |d| Shift.create!(user: users[:clerk], date: wk + d, start_time: "09:00", end_time: "17:00", shift_role: d.zero? ? "opener" : "general") }
    (1..4).each { |d| Shift.create!(user: users[:manager], date: wk + d, start_time: "12:00", end_time: "20:00", shift_role: "closer") }
  end

  if ENV["TRAINING_HOUSE_ACCOUNT"] == "1"
    pat = Customer.find_by!(name: "Pat Lee")
    pat.update!(has_house_account: true, house_account_limit: 300)
    pat.charge_house_account!(amount: 45, user: users[:clerk], notes: "R-1001")
    pat.charge_house_account!(amount: 30, user: users[:clerk], notes: "R-1002")
    paid_note = { "fr" => "Virement", "es" => "Transferencia" }.fetch(ENV.fetch("TRAINING_LOCALE", "en"), "E-transfer")
    pat.pay_house_account!(amount: 25, user: users[:manager], payment_method: "etransfer", notes: paid_note)
  end

  if ENV["TRAINING_TIMESHEETS"] == "1"
    # Three days of 9-to-5 for Riley and Sam, and Riley's clock-in from yesterday left open
    # (forgot to clock out) for the clip to fix.
    Time.use_zone(store.timezone.presence || "America/Toronto") do
      (2..4).each do |ago|
        day = Time.zone.today - ago
        [users[:clerk], users[:manager]].each do |u|
          TimeEntry.create!(user: u, clock_in_at: day.in_time_zone.change(hour: 9), clock_out_at: day.in_time_zone.change(hour: 17), status: "completed")
        end
      end
      TimeEntry.create!(user: users[:manager], clock_in_at: (Time.zone.today - 1).in_time_zone.change(hour: 9), clock_out_at: (Time.zone.today - 1).in_time_zone.change(hour: 17), status: "completed")
      TimeEntry.create!(user: users[:clerk], clock_in_at: (Time.zone.today - 1).in_time_zone.change(hour: 9), status: "active")
    end
  end

  if ENV["TRAINING_DEALS"] == "1"
    fr = ENV.fetch("TRAINING_LOCALE", "en") == "fr"
    SaleCampaign.create!(name: fr ? "Week-end comestibles" : "Edibles Weekend", campaign_type: "discount", discount_type: "percentage",
                         discount_value: 20, apply_to: "categories", category_ids: [Category.find_by!(name: "Edibles").id],
                         application_type: "automatic", active: true, starts_at: 1.hour.ago, ends_at: 7.days.from_now)
    SaleCampaign.create!(name: fr ? "Préroulé gratuit dès 50 $" : "Free Pre-Roll over $50", campaign_type: "freebie_threshold", min_spend_threshold: 50,
                         freebie_product_id: Product.find_by!(name: "House Pre-Roll 1g").id, freebie_quantity: 1,
                         application_type: "automatic", active: true, starts_at: 1.hour.ago, ends_at: 7.days.from_now)
  end

  if ENV["TRAINING_STORE_CREDIT"] == "1"
    # The register spends Customer#store_credit_balance, which add_store_credit! keeps.
    Customer.find_by!(name: "Dana Whitfield").add_store_credit!(amount: 25, reason: "Returned item", user: users[:manager])
  end

  # A second till, so the register asks which one to use (the takeover clip films that screen).
  Register.create!(name: "Register 2", identifier: "REG-002") if ENV["TRAINING_SECOND_REGISTER"] == "1"

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

if ENV["TRAINING_SECOND_STORE"] == "1"
  owner = ActsAsTenant.with_tenant(store) { User.find_by!(email: "owner@#{mail}.training") }
  west = Store.create!(
    store.attributes.slice("store_type", "tax_rate", "tax_name", "currency_symbol", "timezone", "locale", "province",
                           "is_retailer", "is_distributor", "active", "enable_age_verification", "enforce_purchase_limit",
                           "slga_enabled", "setup_wizard_completed_at", "feature_flags", "pos_plan")
      .merge("store_name" => "#{store_name} Westside", "subdomain" => second_subdomain),
  )
  StoreProvisioner.new(west).provision! unless ActsAsTenant.with_tenant(west) { Register.exists? }
  ActsAsTenant.with_tenant(west) do
    load Rails.root.join("db/demo_starter_seed.rb")
    clerk = User.create!(first_name: "Jordan", last_name: "Quill", role: "manager", email: "manager@#{mail}-west.training",
                         store: west, password: password, password_confirmation: password, pin: (pins[:manager].to_i + 1111).to_s[-4..])
    seed_week_of_sales(clerk)
  end
  # Morgan owns both, which is what opens the owner portal.
  [store, west].each { |st| StoreOwnership.find_or_create_by!(user: owner, store: st) { |o| o.role = "owner" } }
  puts "#{west.store_name} (#{second_subdomain}, store #{west.id}); #{owner.email} owns both"
end


if (wholesale = ENV["TRAINING_WHOLESALE"].presence) && wholesale != "0"
  dist = Store.create!(
    store.attributes.slice("store_type", "tax_rate", "tax_name", "currency_symbol", "timezone", "locale", "province",
                           "active", "enable_age_verification", "enforce_purchase_limit", "slga_enabled",
                           "setup_wizard_completed_at", "pos_plan")
      .merge("store_name" => "Northern Lights Wholesale", "subdomain" => wholesale_subdomain,
             "is_distributor" => true, "is_retailer" => false, "relay_server_url" => nil),
  )
  StoreProvisioner.new(dist).provision! unless ActsAsTenant.with_tenant(dist) { Register.exists? }
  dist.update!(feature_flags: (dist.feature_flags || {}).merge("enable_retailer_connections" => true, "enable_wholesale_portal" => true))
  store.update!(relay_server_url: nil, feature_flags: (store.feature_flags || {}).merge("enable_distributor_ordering" => true))
  ActsAsTenant.with_tenant(dist) do
    User.create!(first_name: "Sam", last_name: "Okafor", role: "admin", email: "owner@#{mail.sub('riverstone', 'northernlights')}.training",
                 store: dist, password: password, password_confirmation: password, pin: pins[:owner])
    cat = ->(slug) { Category.find_by(slug: slug) }
    [
      ["NL-PR-005", "Northern Lights Pre-Roll 5-Pack", "pre-rolls", 32.0, 18.0, 400, "pre_roll", "hybrid", 21.0, "%"],
      ["NL-VAP-010", "Aurora Live Resin Cart 1g", "vapes", 55.0, 30.0, 250, "vape", "sativa", 82.0, "%"],
      ["NL-EDI-010", "Boreal Berry Gummies 10x10mg", "edibles", 22.0, 11.0, 600, "edible", nil, 100.0, "mg"],
      ["NL-EDI-020", "Midnight Mint Chocolate 10mg", "edibles", 12.0, 6.0, 500, "edible", nil, 10.0, "mg"],
    ].each_with_index do |(sku, name, slug, price, wprice, stock, fmt, strain, thc, unit), i|
      prod = Product.create!(sku: sku, name: name, barcode: "2000000#{i + 1}", price: price, wholesale_price: wprice,
                             wholesale_enabled: true, unit_type: "unit", current_stock: stock, cost: (wprice * 0.6).round(2),
                             active: true, is_cannabis_product: true, product_format: fmt, strain_type: strain,
                             thc_content: thc, thc_unit: unit, cbd_content: 0, cbd_unit: unit)
      ProductCategory.find_or_create_by!(product: prod, category: cat.(slug)) if cat.(slug)
    end
  end
  if wholesale == "connected"
    code = ActsAsTenant.with_tenant(dist) do
      PairingCode.create!(distributor_uuid: dist.store_uuid, distributor_public_key: dist.encryption_public_key,
                          label: store_name, expires_in_hours: 72).code
    end
    result = ActsAsTenant.with_tenant(store) do
      PairingCodeHandshakeService.new(retailer_store: store, code: code, distributor_label: "Northern Lights Wholesale").call
    end
    raise "pairing failed: #{result.error}" unless result.success?
    ActsAsTenant.with_tenant(dist) do
      rc = RetailerConnection.find(result.retailer_connection.id)
      rc.update!(status: :active, connected_at: Time.current)
      PairingCodeHandshakeService.activate_retailer_side!(distributor_store: dist, retailer_connection: rc)
    end
  end
  puts "#{dist.store_name} (#{wholesale_subdomain}, store #{dist.id})#{' paired with ' + store_name if wholesale == 'connected'}"
end

# Store data, so the screen checks (checks.mjs) know these names are meant to stay as they
# are in a French clip: product, category, customer and staff names aren't translated.
data_names = [store, (Store.find_by(subdomain: second_subdomain) if ENV["TRAINING_SECOND_STORE"] == "1"),
              Store.find_by(subdomain: wholesale_subdomain)].compact.flat_map do |st|
  ActsAsTenant.with_tenant(st) do
    [st.store_name, *Product.pluck(:name), *Category.pluck(:name), *Customer.pluck(:name),
     *User.all.map { |u| [u.first_name, u.last_name, "#{u.first_name} #{u.last_name}"] }.flatten, *Register.pluck(:name)]
  end
end
puts "STORE_DATA_JSON:#{data_names.compact.map(&:to_s).reject(&:empty?).uniq.to_json}"
