package vegaauth

import (
	"fmt"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/dbutils"
)

// EnsureCollections idempotently adds the auth fields and private support collections. Existing
// reserved collections are accepted only when their complete security contract matches; a name
// collision never silently turns credential material into public data.
func (x *Extension) EnsureCollections(app core.App) error {
	auth, err := app.FindCollectionByNameOrId(x.config.AuthCollection)
	if err != nil {
		return fmt.Errorf("vegaauth: auth collection %q not found: %w", x.config.AuthCollection, err)
	}
	if auth.Type != core.CollectionTypeAuth {
		return fmt.Errorf("vegaauth: %q is not an auth collection", x.config.AuthCollection)
	}
	if field := auth.Fields.GetByName("totp_secret"); field == nil {
		auth.Fields.Add(&core.TextField{Name: "totp_secret", Hidden: true})
	} else if typed, ok := field.(*core.TextField); !ok {
		return fmt.Errorf("vegaauth: %s.totp_secret must be text", auth.Name)
	} else {
		typed.Hidden = true
	}
	if field := auth.Fields.GetByName("totp_enabled"); field == nil {
		auth.Fields.Add(&core.BoolField{Name: "totp_enabled"})
	} else if _, ok := field.(*core.BoolField); !ok {
		return fmt.Errorf("vegaauth: %s.totp_enabled must be bool", auth.Name)
	}
	// This extension must be the only token-issuing entry point for its dedicated collection.
	auth.PasswordAuth.Enabled = false
	auth.OTP.Enabled = false
	auth.OAuth2.Enabled = false
	auth.MFA.Enabled = false
	if err := app.Save(auth); err != nil {
		return err
	}

	credentials, err := findOrCreate(app, credentialsCollection, func(collection *core.Collection) {
		collection.Fields.Add(
			&core.RelationField{Name: "user", Required: true, Hidden: true, CollectionId: auth.Id, CascadeDelete: true, MaxSelect: 1},
			&core.TextField{Name: "credential_id", Required: true, Hidden: true},
			&core.TextField{Name: "data", Required: true, Hidden: true, Max: 100000},
			&core.TextField{Name: "name"},
			&core.AutodateField{Name: "created", OnCreate: true},
		)
		collection.AddIndex("idx_vega_webauthn_credential", true, "credential_id", "")
	})
	if err != nil {
		return err
	}
	if err := validatePrivateCollection(credentials); err != nil {
		return err
	}
	if err := requireRelation(credentials, "user", auth.Id, true); err != nil {
		return err
	}
	if err := requireText(credentials, "credential_id", true, true, 0); err != nil {
		return err
	}
	if err := requireText(credentials, "data", true, true, 100000); err != nil {
		return err
	}
	if err := requireText(credentials, "name", false, false, 0); err != nil {
		return err
	}
	if err := requireAutodate(credentials, "created"); err != nil {
		return err
	}
	if err := requireIndex(credentials, "idx_vega_webauthn_credential", true, "credential_id"); err != nil {
		return err
	}

	recovery, err := findOrCreate(app, recoveryCollection, func(collection *core.Collection) {
		collection.Fields.Add(
			&core.RelationField{Name: "user", Required: true, Hidden: true, CollectionId: auth.Id, CascadeDelete: true, MaxSelect: 1},
			&core.TextField{Name: "code_hash", Required: true, Hidden: true},
			&core.BoolField{Name: "used", Hidden: true},
			&core.AutodateField{Name: "created", OnCreate: true},
		)
		collection.AddIndex("idx_vega_recovery_user", false, "user", "")
	})
	if err != nil {
		return err
	}
	if err := validatePrivateCollection(recovery); err != nil {
		return err
	}
	if err := requireRelation(recovery, "user", auth.Id, true); err != nil {
		return err
	}
	if err := requireText(recovery, "code_hash", true, true, 0); err != nil {
		return err
	}
	if err := requireBool(recovery, "used", true); err != nil {
		return err
	}
	if err := requireAutodate(recovery, "created"); err != nil {
		return err
	}
	if err := requireIndex(recovery, "idx_vega_recovery_user", false, "user"); err != nil {
		return err
	}

	attempts, err := findOrCreate(app, attemptsCollection, func(collection *core.Collection) {
		collection.Fields.Add(
			&core.TextField{Name: "identity", Required: true, Hidden: true},
			&core.TextField{Name: "ip", Required: true, Hidden: true},
			&core.NumberField{Name: "attempts", Hidden: true},
			&core.NumberField{Name: "locked_until", Hidden: true},
			&core.NumberField{Name: "updated_at", Hidden: true},
		)
		collection.AddIndex("idx_vega_login_attempts_identity_ip", true, "identity, ip", "")
	})
	if err != nil {
		return err
	}
	if err := validatePrivateCollection(attempts); err != nil {
		return err
	}
	if err := requireText(attempts, "identity", true, true, 0); err != nil {
		return err
	}
	if err := requireText(attempts, "ip", true, true, 0); err != nil {
		return err
	}
	for _, name := range []string{"attempts", "locked_until", "updated_at"} {
		if err := requireNumber(attempts, name, true); err != nil {
			return err
		}
	}
	if err := requireIndex(attempts, "idx_vega_login_attempts_identity_ip", true, "identity", "ip"); err != nil {
		return err
	}
	return nil
}

func findOrCreate(app core.App, name string, configure func(*core.Collection)) (*core.Collection, error) {
	collection, err := app.FindCollectionByNameOrId(name)
	if err == nil {
		return collection, nil
	}
	collection = core.NewBaseCollection(name)
	configure(collection)
	if err := app.Save(collection); err != nil {
		return nil, err
	}
	return collection, nil
}

func validatePrivateCollection(collection *core.Collection) error {
	if collection.Type != core.CollectionTypeBase {
		return fmt.Errorf("vegaauth: reserved collection %s must be a base collection", collection.Name)
	}
	if collection.ListRule != nil || collection.ViewRule != nil || collection.CreateRule != nil ||
		collection.UpdateRule != nil || collection.DeleteRule != nil {
		return fmt.Errorf("vegaauth: reserved collection %s must keep all API rules locked", collection.Name)
	}
	return nil
}

func requireRelation(collection *core.Collection, name, target string, hidden bool) error {
	field, ok := collection.Fields.GetByName(name).(*core.RelationField)
	if !ok || !field.Required || field.CollectionId != target || !field.CascadeDelete ||
		field.MaxSelect != 1 || field.Hidden != hidden {
		return fmt.Errorf("vegaauth: incompatible relation %s.%s", collection.Name, name)
	}
	return nil
}

func requireText(collection *core.Collection, name string, required, hidden bool, max int) error {
	field, ok := collection.Fields.GetByName(name).(*core.TextField)
	if !ok || field.Required != required || field.Hidden != hidden || (max > 0 && field.Max != max) {
		return fmt.Errorf("vegaauth: incompatible text field %s.%s", collection.Name, name)
	}
	return nil
}

func requireBool(collection *core.Collection, name string, hidden bool) error {
	field, ok := collection.Fields.GetByName(name).(*core.BoolField)
	if !ok || field.Hidden != hidden {
		return fmt.Errorf("vegaauth: incompatible bool field %s.%s", collection.Name, name)
	}
	return nil
}

func requireNumber(collection *core.Collection, name string, hidden bool) error {
	field, ok := collection.Fields.GetByName(name).(*core.NumberField)
	if !ok || field.Hidden != hidden {
		return fmt.Errorf("vegaauth: incompatible number field %s.%s", collection.Name, name)
	}
	return nil
}

func requireAutodate(collection *core.Collection, name string) error {
	field, ok := collection.Fields.GetByName(name).(*core.AutodateField)
	if !ok || !field.OnCreate {
		return fmt.Errorf("vegaauth: incompatible autodate field %s.%s", collection.Name, name)
	}
	return nil
}

func requireIndex(collection *core.Collection, name string, unique bool, columns ...string) error {
	index := dbutils.ParseIndex(collection.GetIndex(name))
	if !index.IsValid() || index.IndexName != name || index.TableName != collection.Name ||
		index.Unique != unique || index.Where != "" || len(index.Columns) != len(columns) {
		return fmt.Errorf("vegaauth: incompatible index %s.%s", collection.Name, name)
	}
	for i, column := range columns {
		if index.Columns[i].Name != column || index.Columns[i].Collate != "" || index.Columns[i].Sort != "" {
			return fmt.Errorf("vegaauth: incompatible index %s.%s", collection.Name, name)
		}
	}
	return nil
}
