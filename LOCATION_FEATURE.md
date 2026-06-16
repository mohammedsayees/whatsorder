# Delivery Location Feature

WhatsOrder checkout includes a simple delivery location feature for restaurant pilots. It improves delivery accuracy without adding routing, driver tracking, or distance-based pricing.

## How Location Capture Works

On the checkout page, customers see a **Use my current location** button inside the Delivery location section.

When tapped:

1. The browser asks the customer for location permission.
2. WhatsOrder uses the browser Geolocation API.
3. Latitude and longitude are captured in the browser.
4. A Google Maps URL is generated without any Google API key:

```text
https://www.google.com/maps?q=<latitude>,<longitude>
```

Example:

```text
https://www.google.com/maps?q=25.291334,55.371281
```

If permission is granted, the customer sees:

```text
Location captured successfully
```

They can also open the selected point from the checkout page through **View selected location**.

If permission is denied, WhatsOrder shows:

```text
Location permission denied. Please enter your full address manually.
```

Manual delivery fields remain required for the MVP:

- Delivery area
- Full address / building / flat / villa number
- Landmark

## Stored Order Fields

The `orders` table stores location data per order:

- `delivery_latitude`
- `delivery_longitude`
- `delivery_google_maps_url`
- `delivery_place_id`
- `delivery_address_text`
- `delivery_landmark`

The existing required address fields are still used:

- `delivery_area`
- `delivery_address`

## Stored Customer Fields

The `customers` table stores the latest known default delivery location:

- `default_latitude`
- `default_longitude`
- `default_google_maps_url`
- `default_address_text`
- `default_landmark`

When an order is placed, WhatsOrder finds the customer by restaurant and phone number. Existing customers are updated with the latest default location. New customers are created with the same location fields.

## WhatsApp Message

The WhatsApp order message includes:

```text
Delivery Details:
Area: <delivery_area>
Address: <delivery_address>
Landmark: <delivery_landmark>
Location: <delivery_google_maps_url>
```

If the customer does not share current location, the message says:

```text
Location: Not shared
```

## Admin View

Admin order cards show:

- Delivery area
- Full address
- Landmark
- **Open in Google Maps** link when a location URL is available

## Future Improvements

Good next steps after the pilot:

- Google Places Autocomplete for more structured address selection
- Saving `place_id` and normalized `address_text`
- Delivery zone validation by restaurant or branch
- Multi-branch routing based on customer location
- Distance-based delivery fees
- Driver delivery workflow and order handoff
